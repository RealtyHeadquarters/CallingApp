/// App configuration.
///
/// [apiBaseUrl] can be overridden at build/run time:
///   flutter run --dart-define=API_BASE=http://192.168.1.5:4000/api
///
/// Defaults to the Android emulator's host loopback (10.0.2.2 → host machine).
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:4000/api',
  );
}
