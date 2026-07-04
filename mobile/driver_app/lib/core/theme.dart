import 'package:flutter/material.dart';

/// Meshily brand — primary orange + deep navy.
class MeshilyColors {
  static const primary = Color(0xFFF97316);
  static const navy = Color(0xFF0F172A);
  static const success = Color(0xFF16A34A);
  static const danger = Color(0xFFDC2626);
}

ThemeData meshilyTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: MeshilyColors.primary,
    primary: MeshilyColors.primary,
    brightness: brightness,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor:
        brightness == Brightness.dark ? const Color(0xFF0B1220) : const Color(0xFFF6F7FB),
    appBarTheme: AppBarTheme(
      backgroundColor: brightness == Brightness.dark ? const Color(0xFF121B2E) : Colors.white,
      foregroundColor: brightness == Brightness.dark ? Colors.white : MeshilyColors.navy,
      elevation: 0,
      centerTitle: true,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: MeshilyColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: brightness == Brightness.dark ? const Color(0xFF121B2E) : Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: MeshilyColors.primary, width: 2),
      ),
    ),
    cardTheme: CardTheme(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
  );
}
