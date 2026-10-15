// Configuración
const API_URL = 'http://localhost:8080/api';
const STORAGE_KEYS = {
    TOKEN: 'token',
    USER_ID: 'userId',
    USER_NAME: 'userName',
    USER_EMAIL: 'userEmail'
};

// Elementos del DOM
const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const container = document.getElementById('container');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// ==================== ANIMACIÓN DE PANELES ====================
signUpButton.addEventListener('click', () => {
    container.classList.add('right-panel-active');
});

signInButton.addEventListener('click', () => {
    container.classList.remove('right-panel-active');
});

// ==================== FUNCIONES AUXILIARES ====================
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.style.display = 'block';
    element.className = type === 'error' ? 'error-message' : 'success-message';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 8;
}

function saveUserData(data) {
    if (data.token) localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
    if (data.userId) localStorage.setItem(STORAGE_KEYS.USER_ID, data.userId);
    if (data.name) localStorage.setItem(STORAGE_KEYS.USER_NAME, data.name);
    if (data.email) localStorage.setItem(STORAGE_KEYS.USER_EMAIL, data.email);
}

function redirectToDashboard() {
    window.location.href = '/dashboard';
}

// ==================== REGISTRO ====================
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    // Validaciones
    if (!name) {
        showMessage('registerError', 'Por favor ingresa tu nombre completo', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showMessage('registerError', 'Por favor ingresa un correo electrónico válido', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showMessage('registerError', 'La contraseña debe tener al menos 8 caracteres', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('registerError', 'Las contraseñas no coinciden', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            saveUserData(data);
            showMessage('registerSuccess', '¡Registro exitoso! Redirigiendo...', 'success');
            setTimeout(redirectToDashboard, 1500);
        } else {
            showMessage('registerError', data.error || 'Error al registrarse', 'error');
        }
    } catch (error) {
        showMessage('registerError', 'Error de conexión. Intenta de nuevo.', 'error');
        console.error('Error:', error);
    }
});

// ==================== LOGIN ====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!validateEmail(email)) {
        showMessage('loginError', 'Por favor ingresa un correo electrónico válido', 'error');
        return;
    }

    if (!password) {
        showMessage('loginError', 'Por favor ingresa tu contraseña', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            saveUserData(data);
            showMessage('loginSuccess', '¡Inicio de sesión exitoso! Redirigiendo...', 'success');
            setTimeout(redirectToDashboard, 1000);
        } else {
            showMessage('loginError', data.error || 'Credenciales incorrectas', 'error');
        }
    } catch (error) {
        showMessage('loginError', 'Error de conexión. Intenta de nuevo.', 'error');
        console.error('Error:', error);
    }
});

// ==================== LOGIN CON GOOGLE ====================
document.getElementById('googleLogin').addEventListener('click', () => {
    // Redirige a la autenticación de Google
    // Esto debería ser manejado por tu backend
    window.location.href = `${API_URL}/auth/google`;
});

// ==================== RECUPERAR CONTRASEÑA ====================
document.getElementById('forgotPassword').addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    
    if (!validateEmail(email)) {
        showMessage('loginError', 'Ingresa tu correo para recuperar la contraseña', 'error');
        return;
    }

    // Aquí iría la lógica de recuperación
    showMessage('loginSuccess', 'Se ha enviado un enlace a tu correo para recuperar la contraseña', 'success');
});

// ==================== VERIFICAR SESIÓN ====================
window.addEventListener('load', () => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
        // Verificar si el token es válido
        fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                redirectToDashboard();
            } else {
                localStorage.removeItem(STORAGE_KEYS.TOKEN);
            }
        })
        .catch(() => {
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
        });
    }
});