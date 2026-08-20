import 'package:flutter/material.dart';

/// ProCallingApp brand — modern blue → orange.
class AppColors {
  static const brand = Color(0xFF2F6BFF);
  static const brand600 = Color(0xFF1D4ED8);
  static const brandDark = Color(0xFF0A1533);
  static const violet = Color(0xFF4F8BFF); // blue mid-tone
  static const accent = Color(0xFFF97316); // orange
  static const bg = Color(0xFFEEF1F8);
  static const surface = Colors.white;
  static const text = Color(0xFF14152E);
  static const text2 = Color(0xFF565A78);
  static const text3 = Color(0xFF9095B0);
  static const green = Color(0xFF10B981);
  static const red = Color(0xFFF43F5E);
  static const amber = Color(0xFFF59E0B);
  static const blue = Color(0xFF3B82F6);
  static const border = Color(0xFFE7E9F3);

  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [brand, violet, accent],
  );
  static const brandGradientSoft = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF2F6BFF), Color(0xFF4F8BFF)],
  );
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      primary: AppColors.brand,
      secondary: AppColors.accent,
    ),
    scaffoldBackgroundColor: AppColors.bg,
    fontFamily: 'Roboto',
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(color: AppColors.text, fontSize: 19, fontWeight: FontWeight.w700),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: FadeUpwardsPageTransitionsBuilder(),
    }),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.brand, width: 1.6),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.brand.withValues(alpha: 0.14),
      elevation: 3,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

/// A reusable gradient "hero" container (used behind headers / call button).
BoxDecoration gradientDecoration({double radius = 18}) => BoxDecoration(
      gradient: AppColors.brandGradient,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: [
        BoxShadow(
          color: AppColors.brand.withValues(alpha: 0.35),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
      ],
    );
