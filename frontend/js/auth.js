const APP_CONFIG = {
    apiUrl: "",
    userPoolId: "",
    userPoolClientId: "",
    region: "us-east-1",
};

function loadConfig() {
    const saved = localStorage.getItem("geeksgreeks_config");
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(APP_CONFIG, parsed);
    }
}

function saveConfig(config) {
    Object.assign(APP_CONFIG, config);
    localStorage.setItem("geeksgreeks_config", JSON.stringify(APP_CONFIG));
}

function getAuthToken() {
    return localStorage.getItem("geeksgreeks_token") || "";
}

function setAuthToken(token) {
    localStorage.setItem("geeksgreeks_token", token);
}

function getCurrentUser() {
    const user = localStorage.getItem("geeksgreeks_user");
    return user ? JSON.parse(user) : null;
}

function setCurrentUser(user) {
    localStorage.setItem("geeksgreeks_user", JSON.stringify(user));
}

function isLoggedIn() {
    return !!getAuthToken() && !!getCurrentUser();
}

function logout() {
    localStorage.removeItem("geeksgreeks_token");
    localStorage.removeItem("geeksgreeks_user");
    window.location.href = "index.html";
}

async function apiCall(path, method, body) {
    const url = APP_CONFIG.apiUrl + path;
    const headers = {
        "Content-Type": "application/json",
    };

    const token = getAuthToken();
    if (token) {
        headers["Authorization"] = token;
    }

    const options = { method, headers };
    if (body && method !== "GET") {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
}

async function loginWithCognito(email, password) {
    const params = {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: APP_CONFIG.userPoolClientId,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
        },
    };

    const cognitoUrl = `https://cognito-idp.${APP_CONFIG.region}.amazonaws.com/`;

    const response = await fetch(cognitoUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        },
        body: JSON.stringify(params),
    });

    const data = await response.json();

    if (data.__type && data.__type.includes("Exception")) {
        throw new Error(data.message || "Authentication failed");
    }

    const idToken = data.AuthenticationResult.IdToken;
    setAuthToken(idToken);

    const payload = JSON.parse(atob(idToken.split(".")[1]));
    setCurrentUser({
        email: payload.email,
        name: payload.name || payload.email.split("@")[0],
        sub: payload.sub,
        role: payload["custom:role"] || "user",
    });

    return getCurrentUser();
}

async function signUpWithCognito(email, password, name) {
    const params = {
        ClientId: APP_CONFIG.userPoolClientId,
        Username: email,
        Password: password,
        UserAttributes: [
            { Name: "email", Value: email },
            { Name: "name", Value: name },
        ],
    };

    const cognitoUrl = `https://cognito-idp.${APP_CONFIG.region}.amazonaws.com/`;

    const response = await fetch(cognitoUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.SignUp",
        },
        body: JSON.stringify(params),
    });

    const data = await response.json();

    if (data.__type && data.__type.includes("Exception")) {
        throw new Error(data.message || "Sign up failed");
    }

    return data;
}

async function confirmSignUp(email, code) {
    const params = {
        ClientId: APP_CONFIG.userPoolClientId,
        Username: email,
        ConfirmationCode: code,
    };

    const cognitoUrl = `https://cognito-idp.${APP_CONFIG.region}.amazonaws.com/`;

    const response = await fetch(cognitoUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.ConfirmSignUp",
        },
        body: JSON.stringify(params),
    });

    const data = await response.json();

    if (data.__type && data.__type.includes("Exception")) {
        throw new Error(data.message || "Confirmation failed");
    }

    return data;
}

function showToast(message, type) {
    type = type || "info";
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
        toast.style.opacity = "0";
        setTimeout(function () {
            toast.remove();
        }, 300);
    }, 4000);
}

loadConfig();
