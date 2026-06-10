import { isLocalMode, supabase } from './supabaseClient.js';

const form = document.querySelector('#login-form');
const message = document.querySelector('#auth-message');
const submitButton = form?.querySelector('button[type="submit"]');

if (isLocalMode && submitButton && message) {
  submitButton.textContent = 'Entrar no modo localhost';
  message.textContent = 'Modo local ativo: use o usuário e senha padrão informados pelo desenvolvedor.';
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = isLocalMode ? 'Validando login local...' : 'Autenticando...';

  const formData = new FormData(form);
  const email = formData.get('email');
  const password = formData.get('password');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    message.textContent = `Erro ao entrar: ${error.message}`;
    return;
  }

  window.location.href = './dashboard.html';
});
