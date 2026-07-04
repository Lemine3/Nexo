import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/l10n.dart';
import '../core/session.dart';
import '../core/theme.dart';
import 'auth/login_screen.dart';
import 'home_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
        ..forward();

  @override
  void initState() {
    super.initState();
    _go();
  }

  Future<void> _go() async {
    final session = context.read<Session>();
    await Future.delayed(const Duration(milliseconds: 1400));
    while (!session.ready) {
      await Future.delayed(const Duration(milliseconds: 100));
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => session.isLoggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Scaffold(
      backgroundColor: MeshilyColors.navy,
      body: Center(
        child: ScaleTransition(
          scale: CurvedAnimation(parent: _ctrl, curve: Curves.easeOutBack),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.all(26),
              decoration: BoxDecoration(
                color: MeshilyColors.primary,
                borderRadius: BorderRadius.circular(30),
              ),
              child: const Icon(Icons.two_wheeler, size: 64, color: Colors.white),
            ),
            const SizedBox(height: 22),
            Text(l.t('appName'),
                style: const TextStyle(
                    color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
            Text(l.t('tagline'),
                style: const TextStyle(color: Colors.white70, fontSize: 16)),
          ]),
        ),
      ),
    );
  }
}
