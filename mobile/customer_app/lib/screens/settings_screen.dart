import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/l10n.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import 'auth/login_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(title: Text(l.t('settings'))),
      body: ListView(children: [
        ListTile(
          leading: const Icon(Icons.language),
          title: Text(l.t('language')),
          trailing: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ar', label: Text('عربي')),
              ButtonSegment(value: 'fr', label: Text('FR')),
            ],
            selected: {session.locale.languageCode},
            onSelectionChanged: (s) => session.setLocale(Locale(s.first)),
          ),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.dark_mode),
          title: Text(l.t('darkMode')),
          value: session.themeMode == ThemeMode.dark,
          onChanged: session.setDark,
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title: Text(l.t('logout'), style: const TextStyle(color: Colors.red)),
          onTap: () async {
            SocketService.disconnect();
            await session.logout();
            if (context.mounted) {
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (_) => false,
              );
            }
          },
        ),
      ]),
    );
  }
}
