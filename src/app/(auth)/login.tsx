import React, { useState } from 'react';
import { View, ActivityIndicator, Pressable, Keyboard } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'; 
import { Eye, EyeOff, WifiOff } from 'lucide-react-native';

// Importa tus componentes de UI
import { Text } from '@/src/components/ui/text';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

// IMPORTANTE: Usamos el Contexto Global, no el hook directo
import { useAuth } from '@/src/contexts/AuthContext';

// 1. Esquema de validación local
const loginSchema = z.object({
  email: z.string().email('Ingresa un email válido'),
  password: z.string().min(1, 'La contraseña es requerida').min(6, 'Mínimo 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Usamos useAuth para acceder a la instancia global que controla la app
  const { login, error: authError, isOnline } = useAuth(); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // 2. Configuración del Formulario
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // 3. Manejo del Submit
  const onSubmit = async (data: LoginFormData) => {
    Keyboard.dismiss();
    setIsSubmitting(true);
    setServerError(null);

    // Validación extra de conexión
    if (isOnline === false) {
       setServerError("Se requiere conexión a internet para iniciar sesión");
       setIsSubmitting(false);
       return;
    }

    try {
      // Intentamos login. Si falla, el contexto lanzará un error (catch)
      await login(data.email, data.password);
      
      // Si llegamos aquí, fue exitoso. El RootLayout detectará el cambio de auth state
      // y redirigirá automáticamente, pero podemos forzarlo por seguridad.
      router.replace('/');
    } catch (err: any) {
      console.error("Error en login UI:", err);
      // Mostramos el error que viene del contexto (o uno genérico)
      setServerError(err.message || authError || 'Credenciales incorrectas');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormLoading = isSubmitting;

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 32,
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 20,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      {/* Header / Logo */}
      <View className="mb-10 items-center">
        <Text className="text-3xl font-bold text-foreground">Inicia Sesión</Text>
        <Text className="mt-2 text-center text-muted-foreground">
          Bienvenido de nuevo a la aplicación.
        </Text>
      </View>

      {/* Formulario */}
      <View className="w-full gap-4">
        {/* Email */}
        <View className="gap-1.5">
          <Label nativeID="email">Correo electrónico</Label>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder="correo@ejemplo.com"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                keyboardType="email-address"
                autoCapitalize="none"
                className={errors.email ? 'border-destructive' : ''}
              />
            )}
          />
          {errors.email && (
            <Text className="text-xs text-destructive">{errors.email.message}</Text>
          )}
        </View>

        {/* Password */}
        <View className="gap-1.5">
          <Label nativeID="password">Contraseña</Label>
          <View className="relative justify-center">
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  placeholder="•••••••••••••"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  secureTextEntry={!showPassword}
                  className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                />
              )}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              className="absolute right-3 p-1"
            >
              {showPassword ? (
                <EyeOff size={20} className="text-muted-foreground" />
              ) : (
                <Eye size={20} className="text-muted-foreground" />
              )}
            </Pressable>
          </View>
          {errors.password && (
            <Text className="text-xs text-destructive">{errors.password.message}</Text>
          )}
        </View>

        {/* Olvidaste contraseña */}
        <Pressable 
          onPress={() => {}} 
          className="self-end active:opacity-70 mt-1"
        >
          <Text className="text-sm font-medium text-primary">¿Olvidaste tu contraseña?</Text>
        </Pressable>

        {/* Mensaje Offline */}
        {isOnline === false && (
          <View className="mt-2 flex-row items-center rounded-lg bg-amber-500/10 px-4 py-3">
            <WifiOff size={16} color="#f59e0b" />
            <Text className="ml-2 flex-1 text-sm text-amber-600">
              Sin conexión a internet.
            </Text>
          </View>
        )}

        {/* Mensaje Error Servidor */}
        {(serverError || authError) && (
          <View className="mt-2 rounded-lg bg-destructive/10 px-4 py-3">
            <Text className="text-center text-sm text-destructive">
              {serverError || authError}
            </Text>
          </View>
        )}

        {/* Botón Submit */}
        <Button
          onPress={handleSubmit(onSubmit)}
          disabled={isFormLoading}
          className="mt-6 h-14 w-full rounded-full"
        >
          {isFormLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-semibold text-primary-foreground">
              Iniciar Sesión
            </Text>
          )}
        </Button>

        {/* Separador Social */}
        <View className="my-4 w-full flex-row items-center gap-3">
          <View className="h-[1px] flex-1 bg-border" />
          <Text className="text-xs tracking-wider text-muted-foreground">O entra con</Text>
          <View className="h-[1px] flex-1 bg-border" />
        </View>

        {/* Botones Sociales */}
        <Button variant="outline" className="h-12 rounded-full border-input" onPress={() => {}}>
           <Text className="text-foreground">Google</Text>
        </Button>
      </View>

      {/* Footer Legal y Registro */}
      <View className="pt-8 items-center gap-6">
        <View className="flex-row items-center gap-1">
          <Text className="text-sm text-muted-foreground">¿No tienes cuenta?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text className="text-sm font-bold text-foreground">Regístrate gratis</Text>
            </Pressable>
          </Link>
        </View>

        <Text className="text-center text-xs leading-5 text-muted-foreground px-4">
          Al iniciar sesión, aceptas nuestros{' '}
          <Text className="font-bold">Términos</Text> y{' '}
          <Text className="font-bold">Política de Privacidad</Text>.
        </Text>
      </View>
    </KeyboardAwareScrollView>
  );
}