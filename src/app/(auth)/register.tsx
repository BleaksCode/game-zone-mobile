import React, { useState } from 'react';
import { View, ActivityIndicator, Pressable, Keyboard } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Eye, EyeOff, WifiOff } from 'lucide-react-native';

// UI Components
import { Text } from '@/src/components/ui/text';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

// Hook Lógica
import { useOfflineAuth } from '@/src/hooks/useoffline-auth';
import { useAuth } from '@/src/contexts/AuthContext';

// 1. Esquema de Registro
const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Ingresa un email válido'),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, "Debe contener una mayúscula")
    .regex(/[0-9]/, "Debe contener un número"),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { register, isLoading: authLoading, error: authError } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // 2. Configuración Form
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  // 3. Submit
  const onSubmit = async (data: RegisterFormData) => {
    Keyboard.dismiss();

    setIsSubmitting(true);
    setServerError(null);

    try {
      // 4. Registrar usuario
      await register({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      // Si no hay error desde el auth context:
      if (!authError) {
        router.replace('/');
      } else {
        setServerError(authError);
      }
    } catch (err: any) {
  // Aquí capturas el mensaje real lanzado por el AuthContext
  setServerError(err.message || 'Ocurrió un error inesperado.');
}
  };

  const isFormLoading = authLoading || isSubmitting;

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 32,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 20,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
       {/* Header */}
       <View className="mb-8 items-center">
          <Text className="text-lg font-light text-foreground">
            Bienvenido a <Text className="font-bold">TuApp</Text>
          </Text>
          <Text className="mt-3 text-center text-sm font-light leading-5 text-muted-foreground px-4">
            Crea una cuenta para comenzar a organizar tu mundo digital.
          </Text>
        </View>

      <View className="w-full gap-5">
        
        {/* Nombre */}
        <View className="gap-1.5">
          <Label nativeID="name">Nombre completo</Label>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder="Juan Pérez"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                autoCapitalize="words"
                className={errors.name ? 'border-destructive' : ''}
              />
            )}
          />
          {errors.name && <Text className="text-xs text-destructive">{errors.name.message}</Text>}
        </View>

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
          {errors.email && <Text className="text-xs text-destructive">{errors.email.message}</Text>}
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
          {errors.password && <Text className="text-xs text-destructive">{errors.password.message}</Text>}
        </View>

        {/* Errores Globales */}
        {(serverError || authError) && (
          <View className="mt-2 rounded-lg bg-destructive/10 px-4 py-3">
            <Text className="text-center text-sm text-destructive">
              {serverError || authError}
            </Text>
          </View>
        )}

        {/* Botón Crear Cuenta */}
        <Button
          onPress={handleSubmit(onSubmit)}
          disabled={isFormLoading}
          className="mt-6 h-14 w-full rounded-full"
        >
          {isFormLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-semibold text-primary-foreground">
              Crear Cuenta
            </Text>
          )}
        </Button>
      </View>

      {/* Footer */}
      <View className="pt-8 items-center gap-1">
        <Text className="text-xs text-muted-foreground">¿Ya tienes una cuenta?</Text>
        <Link href="/(auth)/login" asChild>
            <Pressable className="p-2 active:opacity-70">
                <Text className="text-sm font-bold text-foreground">Inicia Sesión</Text>
            </Pressable>
        </Link>
      </View>
    </KeyboardAwareScrollView>
  );
}