import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/design_system/design_system.dart';
import 'core/routing/app_router.dart';

class IgnitionPayApp extends StatelessWidget {
  const IgnitionPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Ignition Pay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}