import Foundation

enum ConsentPreferences {
  static func removeLegacyTCFValues(from defaults: UserDefaults) {
    for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("IABTCF_") {
      defaults.removeObject(forKey: key)
    }
  }
}
