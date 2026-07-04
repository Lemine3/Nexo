import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';

/// App-wide state: authenticated user, locale, theme.
class Session extends ChangeNotifier {
  Map<String, dynamic>? user;
  Locale locale = const Locale('ar');
  ThemeMode themeMode = ThemeMode.light;
  bool ready = false;

  Future<void> bootstrap() async {
    await Api.init();
    final prefs = await SharedPreferences.getInstance();
    locale = Locale(prefs.getString('lang') ?? 'ar');
    themeMode = (prefs.getBool('dark') ?? false) ? ThemeMode.dark : ThemeMode.light;
    if (Api.hasSession) {
      try {
        final data = await Api.get('/users/me');
        user = (data as Map<String, dynamic>)['user'] as Map<String, dynamic>;
      } catch (_) {
        await Api.clear();
      }
    }
    ready = true;
    notifyListeners();
  }

  bool get isLoggedIn => user != null;

  Future<void> setLocale(Locale l) async {
    locale = l;
    (await SharedPreferences.getInstance()).setString('lang', l.languageCode);
    if (isLoggedIn) {
      Api.put('/users/me', {'language': l.languageCode}).catchError((_) => {});
    }
    notifyListeners();
  }

  Future<void> setDark(bool dark) async {
    themeMode = dark ? ThemeMode.dark : ThemeMode.light;
    (await SharedPreferences.getInstance()).setBool('dark', dark);
    notifyListeners();
  }

  Future<void> onAuthenticated(Map<String, dynamic> data) async {
    await Api.saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    user = data['user'] as Map<String, dynamic>;
    notifyListeners();
  }

  Future<void> logout() async {
    await Api.clear();
    user = null;
    notifyListeners();
  }
}
