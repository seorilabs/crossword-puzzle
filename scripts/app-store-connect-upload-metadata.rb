#!/usr/bin/env ruby
# frozen_string_literal: true

require "base64"
require "json"
require "optparse"
require "spaceship"

ROOT = File.expand_path("..", __dir__)
PLACEHOLDERS = ["", "확정 필요", "TODO", "TBD", "FIXME"].freeze
LOCALE_ALIASES = {
  "ko-KR" => "ko"
}.freeze

options = {
  config_path: File.join(ROOT, "app-store/app-store.config.json"),
  locale: nil,
  skip_app_name: false,
  use_suggested_urls: false,
  include_release_notes: false,
  dry_run: false,
  verify_only: false
}

OptionParser.new do |opts|
  opts.banner = "Usage: scripts/app-store-connect-upload-metadata.rb [options]"
  opts.on("--config PATH", "App Store config JSON path") { |value| options[:config_path] = File.expand_path(value, ROOT) }
  opts.on("--locale LOCALE", "Source locale in config, e.g. ko-KR") { |value| options[:locale] = value }
  opts.on("--skip-app-name", "Do not update App Store app name") { options[:skip_app_name] = true }
  opts.on("--use-suggested-urls", "Use suggested support/privacy/marketing URLs") { options[:use_suggested_urls] = true }
  opts.on("--include-release-notes", "Upload release notes as whatsNew") { options[:include_release_notes] = true }
  opts.on("--dry-run", "Print planned changes without uploading") { options[:dry_run] = true }
  opts.on("--verify-only", "Read App Store Connect values without uploading") { options[:verify_only] = true }
  opts.on("-h", "--help", "Print help") do
    puts opts
    exit
  end
end.parse!

def confirmed?(value)
  return !value.nil? unless value.is_a?(String)

  !PLACEHOLDERS.include?(value.strip)
end

def locale_value(values, source_locale)
  return nil unless values.is_a?(Hash)

  values[source_locale]
end

def suggested_or_confirmed(primary, suggested, use_suggested_urls)
  return primary if confirmed?(primary)
  return suggested if use_suggested_urls && confirmed?(suggested)

  primary
end

def add_confirmed_attr(attributes, skipped, key, value, label)
  unless confirmed?(value)
    skipped << label
    return
  end

  attributes[key] = value.strip
end

def app_store_token
  json_path = ENV["APP_STORE_CONNECT_API_KEY_JSON_PATH"]
  return Spaceship::ConnectAPI::Token.from(filepath: json_path) if confirmed?(json_path)

  key_id = ENV["APP_STORE_CONNECT_API_KEY_ID"]
  issuer_id = ENV["APP_STORE_CONNECT_ISSUER_ID"]
  key_base64 = ENV["APP_STORE_CONNECT_PRIVATE_KEY_BASE64"]
  key_path = ENV["APP_STORE_CONNECT_PRIVATE_KEY_PATH"]

  missing = []
  missing << "APP_STORE_CONNECT_API_KEY_ID" unless confirmed?(key_id)
  missing << "APP_STORE_CONNECT_ISSUER_ID" unless confirmed?(issuer_id)
  unless confirmed?(key_base64) || confirmed?(key_path)
    missing << "APP_STORE_CONNECT_PRIVATE_KEY_BASE64 or APP_STORE_CONNECT_PRIVATE_KEY_PATH"
  end
  raise "Missing App Store Connect env: #{missing.join(", ")}" unless missing.empty?

  key = if confirmed?(key_base64)
          Base64.decode64(key_base64.strip)
        else
          File.binread(File.expand_path(key_path))
        end

  Spaceship::ConnectAPI::Token.create(
    key_id: key_id,
    issuer_id: issuer_id,
    key: key,
    duration: 1200,
    in_house: false
  )
end

def find_or_create_localization(collection)
  localization = collection[:items].find { |item| item.locale == collection[:locale] }
  return localization if localization || collection[:verify_only]

  warn "Creating #{collection[:label]} localization: #{collection[:locale]}"
  collection[:create].call({ locale: collection[:locale] })
end

config = JSON.parse(File.read(options[:config_path]))
source_locale = options[:locale] || config["defaultLanguage"] || "ko-KR"
app_store_locale = LOCALE_ALIASES.fetch(source_locale, source_locale)
listing = config.fetch("storeListing", {})
support = config.fetch("support", {})
compliance = config.fetch("compliance", {})

app_info_attrs = {}
version_attrs = {}
skipped = []

if options[:skip_app_name]
  skipped << "name"
else
  add_confirmed_attr(app_info_attrs, skipped, :name, locale_value(listing["appName"], source_locale), "name")
end
add_confirmed_attr(app_info_attrs, skipped, :subtitle, locale_value(listing["subtitle"], source_locale), "subtitle")
add_confirmed_attr(
  app_info_attrs,
  skipped,
  :privacy_policy_url,
  suggested_or_confirmed(
    compliance["privacyPolicyUrl"],
    compliance["suggestedPrivacyPolicyUrl"],
    options[:use_suggested_urls]
  ),
  "privacy_url"
)

add_confirmed_attr(version_attrs, skipped, :description, locale_value(listing["description"], source_locale), "description")
add_confirmed_attr(version_attrs, skipped, :keywords, locale_value(listing["keywords"], source_locale), "keywords")
add_confirmed_attr(
  version_attrs,
  skipped,
  :promotional_text,
  locale_value(listing["promotionalText"], source_locale),
  "promotional_text"
)
add_confirmed_attr(
  version_attrs,
  skipped,
  :support_url,
  suggested_or_confirmed(support["supportUrl"], support["suggestedSupportUrl"], options[:use_suggested_urls]),
  "support_url"
)
add_confirmed_attr(
  version_attrs,
  skipped,
  :marketing_url,
  suggested_or_confirmed(support["marketingUrl"], support["suggestedMarketingUrl"], options[:use_suggested_urls]),
  "marketing_url"
)

if options[:include_release_notes]
  release_notes = locale_value(listing["releaseNotes"], source_locale) || locale_value(config["releaseNotes"], source_locale)
  add_confirmed_attr(version_attrs, skipped, :whats_new, release_notes, "release_notes")
else
  skipped << "release_notes"
end

Spaceship::ConnectAPI.token = app_store_token

bundle_id = config.fetch("bundleId")
target_version = config.fetch("version").fetch("marketingVersion")
app = Spaceship::ConnectAPI::App.find(bundle_id)
raise "App not found on App Store Connect: #{bundle_id}" unless app

platform = Spaceship::ConnectAPI::Platform::IOS
app_info = app.fetch_edit_app_info
raise "Editable App Info not found for #{bundle_id}" unless app_info

version = app.get_edit_app_store_version(platform: platform, includes: nil)
raise "Editable App Store version not found for #{bundle_id}" unless version
if version.version_string != target_version
  raise "Editable App Store version is #{version.version_string}, expected #{target_version}"
end

info_localization = find_or_create_localization(
  items: app_info.get_app_info_localizations,
  locale: app_store_locale,
  label: "App Info",
  verify_only: options[:verify_only],
  create: ->(attrs) { app_info.create_app_info_localization(attributes: attrs) }
)
raise "App Info localization not found: #{app_store_locale}" unless info_localization

version_localization = find_or_create_localization(
  items: version.get_app_store_version_localizations,
  locale: app_store_locale,
  label: "App Store Version",
  verify_only: options[:verify_only],
  create: ->(attrs) { version.create_app_store_version_localization(attributes: attrs) }
)
raise "App Store Version localization not found: #{app_store_locale}" unless version_localization

unless options[:dry_run] || options[:verify_only]
  info_localization.update(attributes: app_info_attrs) unless app_info_attrs.empty?
  version_localization.update(attributes: version_attrs) unless version_attrs.empty?
end

info_localization = app_info.get_app_info_localizations.find { |item| item.locale == app_store_locale }
version_localization = version.get_app_store_version_localizations.find { |item| item.locale == app_store_locale }

readback = {
  app_info: {
    name: info_localization&.name,
    subtitle: info_localization&.subtitle,
    privacy_policy_url: info_localization&.privacy_policy_url
  },
  app_store_version: {
    description: version_localization&.description,
    keywords: version_localization&.keywords,
    promotional_text: version_localization&.promotional_text,
    support_url: version_localization&.support_url,
    marketing_url: version_localization&.marketing_url,
    whats_new: version_localization&.whats_new
  }
}

expected = {
  app_info: app_info_attrs,
  app_store_version: version_attrs
}
verified = expected.all? do |scope, attrs|
  attrs.all? do |key, value|
    readback.fetch(scope).fetch(key) == value
  end
end

puts JSON.pretty_generate(
  bundleId: bundle_id,
  version: target_version,
  sourceLocale: source_locale,
  appStoreLocale: app_store_locale,
  dryRun: options[:dry_run],
  verifyOnly: options[:verify_only],
  updated: {
    appInfo: app_info_attrs.keys,
    appStoreVersion: version_attrs.keys
  },
  skipped: skipped.uniq,
  verified: verified,
  readback: readback
)

exit(1) unless options[:dry_run] || options[:verify_only] || verified
