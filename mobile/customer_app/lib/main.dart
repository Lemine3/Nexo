import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/l10n.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'screens/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase push notifications: after adding google-services.json,
  // initialise Firebase here and register the FCM token via
  // POST /api/users/me/fcm-token (see docs/SETUP.md).
  runApp(
    ChangeNotifierProvider(
      create: (_) => Session()..bootstrap(),
      child: const MeshilyCustomerApp(),
    ),
  );
}

class MeshilyCustomerApp extends StatelessWidget {
  const MeshilyCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return MaterialApp(
      title: 'Meshily',
      debugShowCheckedModeBanner: false,
      theme: meshilyTheme(Brightness.light),
      darkTheme: meshilyTheme(Brightness.dark),
      themeMode: session.themeMode,
      locale: session.locale,
      supportedLocales: L10n.supported,
      localizationsDelegates: const [
        DefaultMaterialLocalizations.delegate,
        DefaultWidgetsLocalizations.delegate,
      ],
      home: const SplashScreen(),
    );
  }
}
