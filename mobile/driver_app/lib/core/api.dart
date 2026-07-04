import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// HTTP client with JWT storage and automatic refresh-token rotation.
class Api {
  static String? _access;
  static String? _refresh;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _access = prefs.getString('access');
    _refresh = prefs.getString('refresh');
  }

  static bool get hasSession => _access != null;
  static String? get accessToken => _access;

  static Future<void> saveTokens(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access', access);
    await prefs.setString('refresh', refresh);
  }

  static Future<void> clear() async {
    _access = null;
    _refresh = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access');
    await prefs.remove('refresh');
  }

  static Future<bool> _tryRefresh() async {
    if (_refresh == null) return false;
    final r = await http.post(
      Uri.parse('${AppConfig.apiBase}/api/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': _refresh}),
    );
    if (r.statusCode != 200) {
      await clear();
      return false;
    }
    final data = jsonDecode(r.body) as Map<String, dynamic>;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return true;
  }

  static Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool retried = false,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBase}/api$path');
    final headers = {
      'Content-Type': 'application/json',
      if (_access != null) 'Authorization': 'Bearer $_access',
    };
    late http.Response r;
    switch (method) {
      case 'GET':
        r = await http.get(uri, headers: headers);
      case 'POST':
        r = await http.post(uri, headers: headers, body: body != null ? jsonEncode(body) : '{}');
      case 'PUT':
        r = await http.put(uri, headers: headers, body: body != null ? jsonEncode(body) : '{}');
      default:
        throw ArgumentError('Unsupported method $method');
    }
    if (r.statusCode == 401 && !retried && await _tryRefresh()) {
      return request(method, path, body: body, retried: true);
    }
    final data = r.body.isEmpty ? {} : jsonDecode(utf8.decode(r.bodyBytes));
    if (r.statusCode >= 400) {
      throw ApiException(r.statusCode, (data is Map ? data['error'] : null)?.toString() ?? 'Error');
    }
    return data;
  }

  static Future<dynamic> get(String path) => request('GET', path);
  static Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      request('POST', path, body: body);
  static Future<dynamic> put(String path, [Map<String, dynamic>? body]) =>
      request('PUT', path, body: body);

  /// Multipart image upload → returns the public URL.
  static Future<String> uploadFile(String filePath) async {
    final req = http.MultipartRequest('POST', Uri.parse('${AppConfig.apiBase}/api/uploads'));
    req.headers['Authorization'] = 'Bearer $_access';
    req.files.add(await http.MultipartFile.fromPath('file', filePath));
    final resp = await http.Response.fromStream(await req.send());
    if (resp.statusCode >= 400) throw ApiException(resp.statusCode, 'Upload failed');
    return (jsonDecode(resp.body) as Map<String, dynamic>)['url'] as String;
  }
}
