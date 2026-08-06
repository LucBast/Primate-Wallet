/**
 * Tela de login — verificação da copy e do comportamento contra
 * design/SCREEN-SPECS.md §6a e o screenshot 6a-login.png.
 *
 * A copy pt-BR é final e comparada verbatim: parafrasear é defeito
 * (CLAUDE.md item 5).
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design-system/theme';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import * as authApi from '../src/features/auth/auth-api';
import { ApiRequestError } from '../src/services/api-client';

jest.mock('../src/features/auth/auth-api');

const mockedApi = authApi as jest.Mocked<typeof authApi>;

async function renderLogin(onCreateAccount = jest.fn()) {
  return render(
    <ThemeProvider initialPreference="light">
      <LoginScreen onCreateAccount={onCreateAccount} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('conteúdo da tela (SCREEN-SPECS §6a)', () => {
  it('mostra todos os blocos, com a copy da especificação', async () => {
    await renderLogin();

    expect(screen.getByText('Family Finance')).toBeTruthy();
    expect(screen.getByText('As finanças da família, num lugar só.')).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.getByText('Entrar')).toBeTruthy();
    expect(screen.getByText('Entrar com link mágico')).toBeTruthy();
    expect(screen.getByText('Esqueci a senha')).toBeTruthy();
    expect(screen.getByText('ou')).toBeTruthy();
    expect(screen.getByText('Criar conta nova')).toBeTruthy();
    expect(screen.getByText('Desbloqueio por biometria')).toBeTruthy();
    expect(screen.getByText('opcional, ativado em Segurança após o login')).toBeTruthy();
    expect(
      screen.getByText('Sessões podem ser revogadas em Família › Dispositivos e sessões.'),
    ).toBeTruthy();
  });

  it('a senha começa oculta e o link alterna para "ocultar"', async () => {
    await renderLogin();
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByText('mostrar'));
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByText('ocultar')).toBeTruthy();
  });

  it('o CTA fica desabilitado até haver e-mail e senha', async () => {
    await renderLogin();
    const button = screen.getByTestId('botao-entrar');
    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('campo-email'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByTestId('campo-senha'), 'senha-de-teste');
    expect(screen.getByTestId('botao-entrar').props.accessibilityState.disabled).toBe(false);
  });
});

describe('entrar', () => {
  it('envia as credenciais e abre a sessão', async () => {
    mockedApi.login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'device-id.refresh',
      expiresIn: 900,
      tokenType: 'Bearer',
      profile: {
        id: '11111111-2222-3333-4444-555555555555',
        email: 'ana@exemplo.com',
        displayName: 'Ana',
        avatarUrl: null,
        emailVerified: true,
        createdAt: '2026-08-06T12:00:00.000Z',
      },
    });

    await renderLogin();
    await fireEvent.changeText(screen.getByTestId('campo-email'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByTestId('campo-senha'), 'senha-de-teste');
    await fireEvent.press(screen.getByTestId('botao-entrar'));

    await waitFor(() => {
      expect(mockedApi.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@exemplo.com', password: 'senha-de-teste' }),
      );
    });
  });

  it('mostra a mensagem do servidor em credenciais inválidas', async () => {
    mockedApi.login.mockRejectedValue(
      new ApiRequestError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401),
    );

    await renderLogin();
    await fireEvent.changeText(screen.getByTestId('campo-email'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByTestId('campo-senha'), 'senha-errada');
    await fireEvent.press(screen.getByTestId('botao-entrar'));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
  });

  it('mostra estado offline quando não há conexão', async () => {
    mockedApi.login.mockRejectedValue(
      new ApiRequestError('NETWORK_ERROR', 'Sem conexão no momento. Verifique sua internet.', 0),
    );

    await renderLogin();
    await fireEvent.changeText(screen.getByTestId('campo-email'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByTestId('campo-senha'), 'senha-de-teste');
    await fireEvent.press(screen.getByTestId('botao-entrar'));

    // Banner offline traz o marcador ◌ da especificação.
    expect(
      await screen.findByText('◌ Sem conexão no momento. Verifique sua internet.'),
    ).toBeTruthy();
  });
});

describe('link mágico', () => {
  it('mostra a resposta neutra do servidor', async () => {
    mockedApi.requestMagicLink.mockResolvedValue({
      status: 'ACCEPTED',
      message: 'Se este e-mail estiver cadastrado, enviamos um link de acesso.',
    });

    await renderLogin();
    await fireEvent.changeText(screen.getByTestId('campo-email'), 'ana@exemplo.com');
    await fireEvent.press(screen.getByText('Entrar com link mágico'));

    expect(
      await screen.findByText('Se este e-mail estiver cadastrado, enviamos um link de acesso.'),
    ).toBeTruthy();
  });
});

describe('criar conta', () => {
  it('o botão secundário navega para o cadastro', async () => {
    const onCreateAccount = jest.fn();
    await renderLogin(onCreateAccount);
    await fireEvent.press(screen.getByTestId('botao-criar-conta'));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
  });
});
