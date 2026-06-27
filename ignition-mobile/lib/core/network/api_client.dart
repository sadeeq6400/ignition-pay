import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../../config/env_config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  late final Dio dio;
  final EnvConfig _envConfig = EnvConfig();

  void initialize() {
    dio = Dio(
      BaseOptions(
        baseUrl: _envConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Add interceptors
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // Add auth token to requests
          final token = dotenv.env['AUTH_TOKEN'];
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onResponse: (response, handler) {
          // Log responses in debug mode
          if (_envConfig.isDebug) {
            print('📡 API Response: ${response.statusCode} - ${response.requestOptions.uri}');
          }
          return handler.next(response);
        },
        onError: (DioException e, handler) {
          // Handle token refresh on 401 errors
          if (e.response?.statusCode == 401) {
            _handleTokenRefresh(e, handler);
          } else {
            if (_envConfig.isDebug) {
              print('❌ API Error: ${e.response?.statusCode} - ${e.message}');
            }
            return handler.next(e);
          }
        },
      ),
    );

    // Add logging interceptor in debug mode
    if (_envConfig.isDebug) {
      dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: true,
      ));
    }
  }

  void _handleTokenRefresh(DioException e, ErrorInterceptorHandler handler) async {
    try {
      // Get refresh token from secure storage (implementation would depend on your auth system)
      final refreshToken = dotenv.env['REFRESH_TOKEN'];
      
      if (refreshToken != null) {
        // Create a new dio instance to avoid infinite loop with existing interceptors
        final refreshDio = Dio(BaseOptions(baseUrl: _envConfig.apiBaseUrl));
        final response = await refreshDio.post('/auth/refresh', data: {
          'refresh_token': refreshToken,
        });

        if (response.statusCode == 200) {
          final newAccessToken = response.data['access_token'];
          // Update the original request with new token
          e.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
          
          // Retry the original request
          final clonedRequest = await dio.request(
            e.requestOptions.path,
            options: Options(
              method: e.requestOptions.method,
              headers: e.requestOptions.headers,
            ),
            data: e.requestOptions.data,
            queryParameters: e.requestOptions.queryParameters,
          );
          
          return handler.resolve(clonedRequest);
        }
      }
    } catch (refreshError) {
      if (_envConfig.isDebug) {
        print('🔄 Token refresh failed: $refreshError');
      }
      // If refresh fails, forward the original error
      return handler.next(e);
    }
  }

  // Helper methods for common HTTP operations
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters}) async {
    return await dio.get<T>(path, queryParameters: queryParameters);
  }

  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.post<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> put<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.put<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> delete<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.delete<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> patch<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.patch<T>(path, data: data, queryParameters: queryParameters);
  }
}