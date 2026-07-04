/// Central configuration. Point [apiBase] at your server.
/// For the Android emulator use 10.0.2.2 instead of localhost.
class AppConfig {
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:4000',
  );

  /// Nouakchott city centre — initial map position.
  static const double defaultLat = 18.0858;
  static const double defaultLng = -15.9582;

  /// Map tiles: OSM works without a key. For the branded look use a Mapbox
  /// style tile URL with your token, e.g.
  /// https://api.mapbox.com/styles/v1/<user>/<style>/tiles/256/{z}/{x}/{y}@2x?access_token=<token>
  static const String tileUrl = String.fromEnvironment(
    'TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );
}
