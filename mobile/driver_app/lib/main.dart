import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/l10n.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'screens/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => Session()..bootstrap(),
      child: const MeshilyDriverApp(),
    ),
  );
}

class MeshilyDriverApp extends StatelessWidget {
  const MeshilyDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return MaterialApp(
      title: 'Meshily Driver',
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
