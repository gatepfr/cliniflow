import { z } from 'zod';

export const SignupSchema = z.object({
  tenantName: z
    .string({ error: 'Nome da clínica é obrigatório' })
    .min(2, 'Nome da clínica deve ter pelo menos 2 caracteres')
    .max(100, 'Nome da clínica deve ter no máximo 100 caracteres')
    .trim(),
  email: z
    .string({ error: 'E-mail é obrigatório' })
    .email('E-mail inválido')
    .toLowerCase(),
  password: z
    .string({ error: 'Senha é obrigatória' })
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(100, 'Senha muito longa'),
  name: z
    .string({ error: 'Seu nome é obrigatório' })
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100)
    .trim(),
});

export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z
    .string({ error: 'E-mail é obrigatório' })
    .email('E-mail inválido')
    .toLowerCase(),
  // max(100) prevents bcrypt DoS: bcrypt silently truncates at 72 bytes,
  // allowing attackers to craft identical hashes with different long passwords.
  password: z
    .string({ error: 'Senha é obrigatória' })
    .min(1, 'Senha é obrigatória')
    .max(100, 'Senha muito longa'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  // refreshToken comes from httpOnly cookie — no body schema needed
  // This schema validates the cookie presence via Fastify plugin
});

export const LogoutSchema = z.object({
  // No body required — uses Authorization header + refresh cookie
});
