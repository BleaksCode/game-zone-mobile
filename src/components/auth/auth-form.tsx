import React, { useState } from 'react';
import { View, ActivityIndicator, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Eye, EyeOff, WifiOff } from 'lucide-react-native';

// Importa tus componentes UI de react-native-reusables
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Label } from '@/src/components/ui/label'; // Si tienes Label, si no usa Text
import { Input } from '@/src/components/ui/input';
import { Separator } from '@/src/components/ui/separator'; // Componente Separator si lo tienes, o View
import { loginSchema, registerSchema, type RegisterFormData } from '@/src/lib/auth-schemas';

// Si no tienes los SVGs configurados, usaremos Textos o Iconos simples por ahora
// import LogosGoogleIcon from '@/assets/icons/LogosGoogleIcon.svg'; 

interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
  serverError?: string | null;
  isOnline?: boolean; // Añadido basado en tu referencia
}

export function AuthForm({ 
  mode, 
  onSubmit, 
  isLoading = false, 
  serverError,
  isOnline = true 
}: AuthFormProps) {
  const insets = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === 'register';

  // --- Lógica del Formulario (Solución al error de TS) ---
  const schema = isRegister ? registerSchema : loginSchema;
  
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const isFormLoading = isLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 32,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* --- Header --- */}
        <View className="mb-8 items-center">
            {/* Aquí iría tu <Image /> logo como en la referencia */}
          <Text className="text-3xl font-bold text-foreground text-center">
            {isRegister ? 'Crear Cuenta' : 'Bienvenido'}
          </Text>
          <Text className="text-sm text-muted-foreground mt-2 text-center px-4 leading-5">
            {isRegister
              ? 'Ingresa tus datos para registrarte en la plataforma.'
              : 'Ingresa tus credenciales para acceder a tu cuenta.'}
          </Text>
        </View>

        {/* --- Offline Warning (De tu referencia) --- */}
        {!isOnline && (
          <View className="mb-6 flex-row items-center rounded-lg bg-amber-500/10 px-4 py-3 border border-amber-500/20">
            <WifiOff size={16} color="#f59e0b" />
            <Text className="ml-2 flex-1 text-sm text-amber-600 font-medium">
              Sin conexión a internet.
            </Text>
          </View>
        )}

        {/* --- Form Fields --- */}
        <View className="gap-4 w-full">
          
          {/* Campo: Nombre (Solo Register) */}
          {isRegister && (
            <View className="gap-1.5">
              <Label nativeID="name" className="text-foreground font-medium">Nombre</Label>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    placeholder="Tu nombre completo"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!isFormLoading}
                    className={errors.name ? 'border-destructive' : ''}
                  />
                )}
              />
              {errors.name && <Text className="text-xs text-destructive">{errors.name.message}</Text>}
            </View>
          )}

          {/* Campo: Email */}
          <View className="gap-1.5">
            <Label nativeID="email" className="text-foreground font-medium">Correo</Label>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  placeholder="correo@ejemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isFormLoading}
                  className={errors.email ? 'border-destructive' : ''}
                />
              )}
            />
            {errors.email && <Text className="text-xs text-destructive">{errors.email.message}</Text>}
          </View>

          {/* Campo: Password con Toggle */}
          <View className="gap-1.5">
            <Label nativeID="password" className="text-foreground font-medium">Contraseña</Label>
            <View className="relative justify-center">
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    placeholder="•••••••••••••"
                    secureTextEntry={!showPassword}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!isFormLoading}
                    className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
                  />
                )}
              />
              <Pressable 
                onPress={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3"
              >
                {showPassword ? (
                  <EyeOff size={20} className="text-muted-foreground" />
                ) : (
                  <Eye size={20} className="text-muted-foreground" />
                )}
              </Pressable>
            </View>
            {errors.password && <Text className="text-xs text-destructive">{errors.password.message}</Text>}
          </View>

          {/* Forgot Password Link (Solo Login) */}
          {!isRegister && (
            <Pressable className="self-end active:opacity-70 mt-1">
                {/* Puedes usar router.push aquí si tienes la ruta */}
              <Text className="text-sm font-medium text-primary">¿Olvidaste tu contraseña?</Text>
            </Pressable>
          )}
        </View>

        {/* --- Server Error --- */}
        {serverError && (
          <View className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 border border-destructive/20">
            <Text className="text-center text-sm text-destructive font-medium">{serverError}</Text>
          </View>
        )}

        {/* --- Main Button --- */}
        <Button
          onPress={handleSubmit(onSubmit)}
          disabled={isFormLoading || !isOnline}
          className="mt-8 h-12 w-full rounded-full"
          size="lg"
        >
          {isFormLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-semibold text-primary-foreground">
              {isRegister ? 'Registrarse' : 'Iniciar Sesión'}
            </Text>
          )}
        </Button>

        {/* --- Divider Social (Estilo Login.tsx) --- */}
        <View className="my-6 w-full flex-row items-center gap-3">
          <View className="h-[1px] flex-1 bg-border" />
          <Text className="text-xs tracking-wider text-muted-foreground">O continúa con</Text>
          <View className="h-[1px] flex-1 bg-border" />
        </View>

        {/* --- Social Buttons --- */}
        <View className="gap-3 w-full">
            <Button variant="outline" className="h-12 w-full rounded-full border-input flex-row gap-2">
                {/* <LogosGoogleIcon width={20} height={20} /> */}
                <Text className="text-foreground font-medium">Google</Text>
            </Button>
            <Button className="h-12 w-full rounded-full bg-foreground flex-row gap-2">
                {/* Icono Apple */}
                <Text className="text-background font-medium">Apple ID</Text>
            </Button>
        </View>

        {/* --- Footer Legal (Estilo Login.tsx) --- */}
        <View className="mt-10 items-center">
            <Text className="text-center text-xs leading-5 text-muted-foreground px-4">
            Al {isRegister ? 'registrarte' : 'iniciar sesión'}, aceptas nuestros{' '}
            <Link href="/" className="font-bold text-foreground">Términos de Servicio</Link> y{' '}
            <Link href="/" className="font-bold text-foreground">Política de Privacidad</Link>.
            </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}