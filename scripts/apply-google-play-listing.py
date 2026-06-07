#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
from pathlib import Path


ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
UNRESOLVED_MARKERS = ("", "확정 필요", "TODO", "TBD", "FIXME")
IMAGE_FIELDS = [
    ("playIcon", "icon"),
    ("featureGraphic", "featureGraphic"),
    ("phoneScreenshots", "phoneScreenshots"),
    ("sevenInchTabletScreenshots", "sevenInchScreenshots"),
    ("tenInchTabletScreenshots", "tenInchScreenshots"),
]
MANUAL_GATES = [
    "first app creation",
    "privacy policy URL setup/review",
    "target audience",
    "IARC content rating",
    "Korea/GRAC judgement",
    "policy declaration correctness",
    "production access",
]


def load_json(path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def unresolved(value):
    if value is None:
        return True
    if isinstance(value, str):
        stripped = value.strip()
        return any(stripped == marker or marker in stripped for marker in UNRESOLVED_MARKERS if marker)
    if isinstance(value, list):
        return any(unresolved(item) for item in value)
    if isinstance(value, dict):
        return any(unresolved(item) for item in value.values())
    return False


def nested(data, *keys):
    current = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def image_paths(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    return [value]


def listing_locales(config):
    listing = config.get("storeListing", {})
    return sorted(
        set(listing.get("appName", {}))
        | set(listing.get("shortDescription", {}))
        | set(listing.get("fullDescription", {}))
    )


def validate_api_writable(root, config, allow_missing_tablet):
    issues = []
    required_fields = [
        ("packageName",),
        ("defaultLanguage",),
        ("contactEmail",),
        ("storeListing", "appName"),
        ("storeListing", "shortDescription"),
        ("storeListing", "fullDescription"),
        ("assets", "playIcon"),
        ("assets", "featureGraphic"),
        ("assets", "phoneScreenshots"),
    ]

    for field in required_fields:
        value = nested(config, *field)
        if unresolved(value):
            issues.append({"code": "unresolved-api-field", "message": ".".join(field)})

    listing = config.get("storeListing", {})
    for locale in listing_locales(config):
        title = listing.get("appName", {}).get(locale)
        short = listing.get("shortDescription", {}).get(locale)
        full = listing.get("fullDescription", {}).get(locale)
        if unresolved(title) or unresolved(short) or unresolved(full):
            issues.append({"code": "incomplete-listing-locale", "message": locale})
            continue
        if len(title) > 30:
            issues.append({"code": "app-name-too-long", "message": f"{locale}: {len(title)}"})
        if len(short) > 80:
            issues.append({"code": "short-description-too-long", "message": f"{locale}: {len(short)}"})
        if len(full) > 4000:
            issues.append({"code": "full-description-too-long", "message": f"{locale}: {len(full)}"})

    assets = config.get("assets", {})
    for field, _image_type in IMAGE_FIELDS:
        paths = image_paths(assets.get(field))
        if field in {"sevenInchTabletScreenshots", "tenInchTabletScreenshots"} and allow_missing_tablet and not paths:
            continue
        if not paths:
            issues.append({"code": "missing-image-field", "message": field})
            continue
        for raw_path in paths:
            if unresolved(raw_path):
                issues.append({"code": "unresolved-image-path", "message": field})
                continue
            path = root / raw_path
            if not path.exists():
                issues.append({"code": "missing-image-file", "message": raw_path})

    return issues


def build_plan(root, config, allow_missing_tablet):
    assets = config.get("assets", {})
    listing = config.get("storeListing", {})
    plan = {
        "packageName": config.get("packageName"),
        "details": {
            "defaultLanguage": config.get("defaultLanguage"),
            "contactEmail": config.get("contactEmail"),
            "contactWebsite": config.get("contactWebsite"),
            "contactPhone": config.get("contactPhone"),
        },
        "listings": [],
        "images": [],
        "manualGates": MANUAL_GATES,
        "trackedButNotWritten": {
            "privacyPolicyUrl": config.get("privacyPolicyUrl"),
            "dataSafety": config.get("contentDeclarations", {}).get("dataSafety"),
            "contentRating": config.get("contentDeclarations", {}).get("contentRating"),
            "targetAudience": config.get("contentDeclarations", {}).get("targetAudience"),
            "koreaGameRating": config.get("contentDeclarations", {}).get("koreaGameRating"),
        },
    }

    for locale in listing_locales(config):
        plan["listings"].append(
            {
                "language": locale,
                "title": listing.get("appName", {}).get(locale),
                "shortDescription": listing.get("shortDescription", {}).get(locale),
                "fullDescriptionLength": len(listing.get("fullDescription", {}).get(locale, "")),
                "video": listing.get("video", {}).get(locale, ""),
            }
        )

    for field, image_type in IMAGE_FIELDS:
        paths = image_paths(assets.get(field))
        if field in {"sevenInchTabletScreenshots", "tenInchTabletScreenshots"} and allow_missing_tablet and not paths:
            continue
        if paths:
            plan["images"].append({"field": field, "imageType": image_type, "paths": paths})

    return plan


def decode_service_account_secret():
    raw_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    encoded_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64")
    if raw_json and encoded_json:
        raise RuntimeError("Set only one of GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64.")
    if raw_json:
        return json.loads(raw_json)
    if encoded_json:
        return json.loads(base64.b64decode(encoded_json).decode("utf-8"))
    return None


def make_android_publisher():
    try:
        import google.auth
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as error:
        raise RuntimeError("Install google-api-python-client and google-auth to use --apply/--verify.") from error

    info = decode_service_account_secret()
    if info:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[ANDROID_PUBLISHER_SCOPE],
        )
    else:
        credentials, _project_id = google.auth.default(scopes=[ANDROID_PUBLISHER_SCOPE])
    return build("androidpublisher", "v3", credentials=credentials, cache_discovery=False)


def execute(request, retries):
    return request.execute(num_retries=retries)


def mime_type(path):
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    return "application/octet-stream"


def apply_listing(root, config, args):
    from googleapiclient.http import MediaFileUpload

    publisher = make_android_publisher()
    package_name = config["packageName"]
    edit = execute(publisher.edits().insert(packageName=package_name, body={}), args.api_retries)
    edit_id = edit["id"]
    result = {"packageName": package_name, "editId": edit_id, "updated": {"details": False, "listings": [], "images": []}}

    try:
        detail_body = {
            "defaultLanguage": config.get("defaultLanguage"),
            "contactEmail": config.get("contactEmail"),
        }
        if config.get("contactWebsite"):
            detail_body["contactWebsite"] = config["contactWebsite"]
        if config.get("contactPhone"):
            detail_body["contactPhone"] = config["contactPhone"]
        execute(publisher.edits().details().patch(packageName=package_name, editId=edit_id, body=detail_body), args.api_retries)
        result["updated"]["details"] = True

        listing = config.get("storeListing", {})
        for locale in listing_locales(config):
            body = {
                "language": locale,
                "title": listing["appName"][locale],
                "shortDescription": listing["shortDescription"][locale],
                "fullDescription": listing["fullDescription"][locale],
            }
            video = listing.get("video", {}).get(locale)
            if video:
                body["video"] = video
            execute(
                publisher.edits().listings().update(
                    packageName=package_name,
                    editId=edit_id,
                    language=locale,
                    body=body,
                ),
                args.api_retries,
            )
            result["updated"]["listings"].append(locale)

        if not args.skip_images:
            locale = args.image_language or config.get("defaultLanguage")
            assets = config.get("assets", {})
            for field, image_type in IMAGE_FIELDS:
                paths = image_paths(assets.get(field))
                if field in {"sevenInchTabletScreenshots", "tenInchTabletScreenshots"} and args.allow_missing_tablet and not paths:
                    continue
                if not paths:
                    continue
                if args.replace_images:
                    execute(
                        publisher.edits().images().deleteall(
                            packageName=package_name,
                            editId=edit_id,
                            language=locale,
                            imageType=image_type,
                        ),
                        args.api_retries,
                    )
                for raw_path in paths:
                    path = root / raw_path
                    media = MediaFileUpload(str(path), mimetype=mime_type(path), resumable=True)
                    response = execute(
                        publisher.edits().images().upload(
                            packageName=package_name,
                            editId=edit_id,
                            language=locale,
                            imageType=image_type,
                            media_body=media,
                        ),
                        args.api_retries,
                    )
                    uploaded = response.get("image", response)
                    result["updated"]["images"].append({"imageType": image_type, "path": raw_path, "id": uploaded.get("id")})

        commit_kwargs = {"packageName": package_name, "editId": edit_id}
        if args.changes_not_sent_for_review:
            commit_kwargs["changesNotSentForReview"] = True
        try:
            committed = execute(publisher.edits().commit(**commit_kwargs), args.api_retries)
        except Exception as error:
            if args.changes_not_sent_for_review and "changesNotSentForReview must not be set" in str(error):
                commit_kwargs.pop("changesNotSentForReview", None)
                result["changesNotSentForReview"] = "omitted-after-api-rejection"
                committed = execute(publisher.edits().commit(**commit_kwargs), args.api_retries)
            else:
                raise
        result["committedEditId"] = committed.get("id")
        return result
    except Exception:
        try:
            execute(publisher.edits().delete(packageName=package_name, editId=edit_id), args.api_retries)
        finally:
            raise


def verify_listing(config, args):
    publisher = make_android_publisher()
    package_name = config["packageName"]
    edit = execute(publisher.edits().insert(packageName=package_name, body={}), args.api_retries)
    edit_id = edit["id"]
    checks = []
    try:
        details = execute(publisher.edits().details().get(packageName=package_name, editId=edit_id), args.api_retries)
        checks.append(compare("details.defaultLanguage", config.get("defaultLanguage"), details.get("defaultLanguage")))
        checks.append(compare("details.contactEmail", config.get("contactEmail"), details.get("contactEmail")))

        listing = config.get("storeListing", {})
        for locale in listing_locales(config):
            current = execute(
                publisher.edits().listings().get(packageName=package_name, editId=edit_id, language=locale),
                args.api_retries,
            )
            checks.append(compare(f"listing.{locale}.title", listing["appName"][locale], current.get("title")))
            checks.append(compare(f"listing.{locale}.shortDescription", listing["shortDescription"][locale], current.get("shortDescription")))
            checks.append(compare(f"listing.{locale}.fullDescription", listing["fullDescription"][locale], current.get("fullDescription")))
    finally:
        execute(publisher.edits().delete(packageName=package_name, editId=edit_id), args.api_retries)
    return {"packageName": package_name, "checks": checks, "ok": all(check["ok"] for check in checks)}


def compare(field, expected, actual):
    return {"field": field, "expected": expected, "actual": actual, "ok": expected == actual}


def main():
    parser = argparse.ArgumentParser(description="Apply API-writable Google Play listing metadata.")
    parser.add_argument("--root", default=".", help="App repository root.")
    parser.add_argument("--config", default="play-store/google-play.config.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    parser.add_argument("--replace-images", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--image-language")
    parser.add_argument("--changes-not-sent-for-review", action="store_true")
    parser.add_argument("--allow-missing-tablet", action="store_true")
    parser.add_argument("--api-retries", type=int, default=int(os.environ.get("GOOGLE_PLAY_API_RETRIES", "3")))
    args = parser.parse_args()

    root = Path(args.root).resolve()
    config = load_json((root / args.config).resolve())
    issues = validate_api_writable(root, config, args.allow_missing_tablet)
    if issues:
        print(json.dumps({"status": "not-ready", "issues": issues}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    if not args.apply and not args.verify:
        args.dry_run = True

    if args.dry_run:
        print(json.dumps({"mode": "dry-run", "plan": build_plan(root, config, args.allow_missing_tablet)}, ensure_ascii=False, indent=2))
        return 0
    if args.apply:
        print(json.dumps({"mode": "apply", "result": apply_listing(root, config, args)}, ensure_ascii=False, indent=2))
        return 0
    if args.verify:
        result = verify_listing(config, args)
        print(json.dumps({"mode": "verify", "result": result}, ensure_ascii=False, indent=2))
        return 0 if result["ok"] else 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
