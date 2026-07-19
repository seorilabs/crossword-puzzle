import UIKit
import Firebase
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

private struct NativeGameAssetManifest: Decodable {
  let schemaVersion: Int
  let aggregateChecksum: String
}

private enum NativeGameBundleLaunchProperties {
  private static let directoryName = "CrosswordGame"
  private static let checksumPattern = #"^sha256:[a-f0-9]{64}$"#

  static func make(from bundle: Bundle) -> [String: String]? {
    guard let resourceURL = bundle.resourceURL?.standardizedFileURL else {
      return nil
    }

    let directoryURL = resourceURL
      .appendingPathComponent(directoryName, isDirectory: true)
      .standardizedFileURL
    guard
      isDirectoryWithoutSymlinks(directoryURL),
      isContained(directoryURL, in: resourceURL)
    else {
      return nil
    }

    guard
      let indexURL = regularFileURL(
        directoryURL.appendingPathComponent("index.html", isDirectory: false),
        inside: directoryURL
      ),
      let assetManifestURL = regularFileURL(
        directoryURL.appendingPathComponent("asset-manifest.json", isDirectory: false),
        inside: directoryURL
      ),
      let manifestData = try? Data(contentsOf: assetManifestURL, options: [.mappedIfSafe]),
      let manifest = try? JSONDecoder().decode(
        NativeGameAssetManifest.self,
        from: manifestData
      ),
      manifest.schemaVersion == 1,
      manifest.aggregateChecksum.range(
        of: checksumPattern,
        options: .regularExpression
      ) != nil
    else {
      return nil
    }

    return [
      "indexUrl": indexURL.absoluteString,
      "readAccessUrl": directoryURL.absoluteString,
      "assetManifestUrl": assetManifestURL.absoluteString,
      "assetManifestChecksum": manifest.aggregateChecksum,
      "bridgeSessionId": UUID().uuidString,
    ]
  }

  private static func isDirectoryWithoutSymlinks(_ url: URL) -> Bool {
    guard
      let values = try? url.resourceValues(
        forKeys: [.isDirectoryKey, .isSymbolicLinkKey]
      )
    else {
      return false
    }
    return values.isDirectory == true && values.isSymbolicLink != true
  }

  private static func regularFileURL(_ url: URL, inside directoryURL: URL) -> URL? {
    guard
      isContained(url, in: directoryURL),
      let values = try? url.resourceValues(
        forKeys: [.isRegularFileKey, .isSymbolicLinkKey]
      ),
      values.isRegularFile == true,
      values.isSymbolicLink != true
    else {
      return nil
    }
    return url
  }

  private static func isContained(_ candidateURL: URL, in directoryURL: URL) -> Bool {
    let directoryPath = directoryURL.resolvingSymlinksInPath().standardizedFileURL.path
    let candidatePath = candidateURL.resolvingSymlinksInPath().standardizedFileURL.path
    return candidatePath.hasPrefix(directoryPath + "/")
  }
}

private enum NativeDevelopmentGameRuntimeOverride {
  static let initialPropertyName = "nativeDevelopmentGameRuntimeOverride"
  static let initialPropertyToken = "crossword-native-game-runtime-debug-v1"
  static let launchArgument = "--crossword-dev-game-runtime"

  static func make(arguments: [String]) -> String? {
#if DEBUG
#if targetEnvironment(simulator)
    return arguments.contains(launchArgument) ? initialPropertyToken : nil
#else
    return nil
#endif
#else
    return nil
#endif
  }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    var initialProperties: [String: Any] = [:]
    if let nativeGameBundle = NativeGameBundleLaunchProperties.make(from: .main) {
      initialProperties["nativeGameBundle"] = nativeGameBundle
    }
    if let developmentOverride = NativeDevelopmentGameRuntimeOverride.make(
      arguments: ProcessInfo.processInfo.arguments
    ) {
      initialProperties[NativeDevelopmentGameRuntimeOverride.initialPropertyName] =
        developmentOverride
    }

    factory.startReactNative(
      withModuleName: "CrosswordPuzzleMobile",
      in: window,
      initialProperties: initialProperties,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
