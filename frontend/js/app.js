let currentSessionId = null;
let isProcessing = false;

document.addEventListener("DOMContentLoaded", function () {
    loadConfig();

    if (!isLoggedIn() && !APP_CONFIG.apiUrl) {
        showSetupModal();
        return;
    }

    initChat();
});

function showSetupModal() {
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="auth-container">
            <div class="auth-card">
                <div style="text-align:center;margin-bottom:20px">
                    <div style="width:64px;height:64px;background:var(--accent);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:var(--primary)">GG</div>
                </div>
                <h1>GeeksGreeks Setup</h1>
                <p class="subtitle">Configure your AWS backend connection</p>
                <div id="setup-form">
                    <div class="form-group">
                        <label>API Gateway URL</label>
                        <input type="url" id="setup-api-url" placeholder="https://xxxxxx.execute-api.us-east-1.amazonaws.com/dev" value="${APP_CONFIG.apiUrl || ''}">
                    </div>
                    <div class="form-group">
                        <label>Cognito User Pool ID</label>
                        <input type="text" id="setup-pool-id" placeholder="us-east-1_xxxxxxxxx" value="${APP_CONFIG.userPoolId || ''}">
                    </div>
                    <div class="form-group">
                        <label>Cognito App Client ID</label>
                        <input type="text" id="setup-client-id" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxx" value="${APP_CONFIG.userPoolClientId || ''}">
                    </div>
                    <div class="form-group">
                        <label>AWS Region</label>
                        <input type="text" id="setup-region" placeholder="us-east-1" value="${APP_CONFIG.region || 'us-east-1'}">
                    </div>
                    <button class="btn btn-primary" onclick="saveSetup()">Save & Continue</button>
                    <div style="text-align:center;margin-top:16px">
                        <a href="#" onclick="skipSetup()" style="color:var(--text-light);font-size:13px">Skip setup (demo mode)</a>
                    </div>
                </div>
            </div>
        </div>`;
}

function saveSetup() {
    const apiUrl = document.getElementById("setup-api-url").value.trim().replace(/\/$/, "");
    const poolId = document.getElementById("setup-pool-id").value.trim();
    const clientId = document.getElementById("setup-client-id").value.trim();
    const region = document.getElementById("setup-region").value.trim() || "us-east-1";

    if (!apiUrl) {
        showToast("API Gateway URL is required", "error");
        return;
    }

    saveConfig({ apiUrl: apiUrl, userPoolId: poolId, userPoolClientId: clientId, region: region });
    showToast("Configuration saved!", "success");

    if (poolId && clientId) {
        window.location.href = "index.html#login";
    } else {
        initChat();
    }
}

function skipSetup() {
    saveConfig({ apiUrl: "demo", userPoolId: "", userPoolClientId: "", region: "us-east-1" });
    setCurrentUser({ email: "demo@geeksgreeks.com", name: "Demo User", sub: "demo-user", role: "user" });
    setAuthToken("demo-token");
    initChat();
}

function initChat() {
    const container = document.getElementById("app-content");
    container.innerHTML = `
        <div class="main-container">
            <div class="chat-sidebar">
                <div class="chat-sidebar-header">
                    <h3>Conversations</h3>
                    <button class="btn btn-sm btn-primary" onclick="startNewSession()">+ New</button>
                </div>
                <div class="session-list" id="session-list"></div>
            </div>
            <div class="chat-main">
                <div class="chat-header">
                    <h2><span class="status-dot"></span> GeeksGreeks Support</h2>
                    <div>
                        <button class="btn btn-sm btn-outline" onclick="showSetupModal()">Settings</button>
                    </div>
                </div>
                <div class="chat-messages" id="chat-messages">
                    <div class="empty-state">
                        <div class="icon">💬</div>
                        <h3>Welcome to GeeksGreeks Support</h3>
                        <p>Ask me anything! I can help with refunds, password resets, account issues, and more.</p>
                    </div>
                </div>
                <div class="typing-indicator" id="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
                <div class="chat-input-area">
                    <div class="chat-input-wrapper">
                        <textarea id="chat-input" placeholder="Type your message..." rows="1" onkeydown="handleKeyDown(event)"></textarea>
                        <button class="btn-send" id="send-btn" onclick="sendMessage()" title="Send message">&#10148;</button>
                    </div>
                </div>
            </div>
        </div>`;

    updateNavbar();
    startNewSession();

    const textarea = document.getElementById("chat-input");
    textarea.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });
}

function updateNavbar() {
    const user = getCurrentUser();
    const nav = document.getElementById("navbar");
    if (nav && user) {
        const userArea = nav.querySelector(".navbar-user");
        if (userArea) {
            const initial = (user.name || user.email || "U")[0].toUpperCase();
            userArea.innerHTML = `<div class="avatar">${initial}</div><span>${user.name || user.email}</span><button class="btn btn-sm btn-outline" onclick="logout()" style="margin-left:8px;color:white;border-color:rgba(255,255,255,0.3)">Logout</button>`;
        }
    }
}

function startNewSession() {
    currentSessionId = "session-" + Date.now();
    const messagesDiv = document.getElementById("chat-messages");
    if (messagesDiv) {
        messagesDiv.innerHTML = `
            <div class="empty-state">
                <div class="icon">💬</div>
                <h3>Welcome to GeeksGreeks Support</h3>
                <p>Ask me anything! I can help with refunds, password resets, account issues, and more.</p>
            </div>`;
    }

    addSessionToSidebar(currentSessionId);
}

function addSessionToSidebar(sessionId) {
    const list = document.getElementById("session-list");
    if (!list) return;

    const existingItems = list.querySelectorAll(".session-item");
    existingItems.forEach(function (item) { item.classList.remove("active"); });

    const item = document.createElement("div");
    item.className = "session-item active";
    item.dataset.sessionId = sessionId;
    item.innerHTML = `<div class="session-title">New conversation</div><div class="session-time">${new Date().toLocaleTimeString()}</div>`;
    item.onclick = function () {
        const allItems = list.querySelectorAll(".session-item");
        allItems.forEach(function (i) { i.classList.remove("active"); });
        item.classList.add("active");
        currentSessionId = sessionId;
    };

    list.insertBefore(item, list.firstChild);
}

function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();

    if (!message || isProcessing) return;

    isProcessing = true;
    input.value = "";
    input.style.height = "auto";

    const sendBtn = document.getElementById("send-btn");
    sendBtn.disabled = true;

    const messagesDiv = document.getElementById("chat-messages");
    const emptyState = messagesDiv.querySelector(".empty-state");
    if (emptyState) emptyState.remove();

    appendMessage("user", message);

    const typingIndicator = document.getElementById("typing-indicator");
    typingIndicator.classList.add("visible");
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        let response;
        if (APP_CONFIG.apiUrl === "demo") {
            response = await getDemoResponse(message);
        } else {
            response = await apiCall("/chat", "POST", {
                message: message,
                sessionId: currentSessionId,
            });
        }

        typingIndicator.classList.remove("visible");
        appendMessage("bot", response.response, response.sentiment, response.actionTaken);

        const activeSession = document.querySelector(".session-item.active .session-title");
        if (activeSession && activeSession.textContent === "New conversation") {
            activeSession.textContent = message.substring(0, 30) + (message.length > 30 ? "..." : "");
        }
    } catch (err) {
        typingIndicator.classList.remove("visible");
        appendMessage("bot", "Sorry, I encountered an error. Please try again. (" + err.message + ")");
        showToast("Error: " + err.message, "error");
    }

    isProcessing = false;
    sendBtn.disabled = false;
    input.focus();
}

function appendMessage(role, content, sentiment, action) {
    const messagesDiv = document.getElementById("chat-messages");

    const msgDiv = document.createElement("div");
    msgDiv.className = "message " + role;

    let html = '<div class="content">' + escapeHtml(content) + "</div>";

    let metaHtml = '<div class="meta"><span>' + new Date().toLocaleTimeString() + "</span>";

    if (sentiment) {
        const sentimentClass = "sentiment-" + sentiment.toLowerCase();
        metaHtml += '<span class="sentiment-badge ' + sentimentClass + '">' + sentiment + "</span>";
    }

    metaHtml += "</div>";
    html += metaHtml;

    if (action && action.status) {
        const actionClass = action.status === "completed" ? "action-badge" : "";
        html += '<div class="' + actionClass + '">' + escapeHtml(action.message || "") + "</div>";
    }

    msgDiv.innerHTML = html;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function getDemoResponse(message) {
    await new Promise(function (resolve) { setTimeout(resolve, 800 + Math.random() * 1200); });

    const lower = message.toLowerCase();
    let response = "";
    let sentiment = "NEUTRAL";
    let action = null;

    if (lower.includes("refund")) {
        response = "I can help you with a refund! I've initiated a refund for your recent order. The refund will be processed within 3-5 business days and credited back to your original payment method. Is there anything else I can help you with?";
        sentiment = "NEUTRAL";
        action = { status: "completed", message: "Refund processed successfully (ID: demo-ref-001)", action: "refund" };
    } else if (lower.includes("password") || lower.includes("login") || lower.includes("locked")) {
        response = "I'll help you reset your password right away! I've sent a password reset link to your registered email address. Please check your inbox (and spam folder) and follow the instructions to set a new password. The link will expire in 24 hours.";
        sentiment = "NEUTRAL";
        action = { status: "completed", message: "Password reset email sent (ID: demo-pwd-001)", action: "reset_password" };
    } else if (lower.includes("cancel") || lower.includes("unsubscribe")) {
        response = "I understand you'd like to cancel your subscription. This request requires manager approval for security purposes. I've created an escalation ticket and a team lead will review your request within 2 hours. You'll receive an email confirmation once it's processed.";
        sentiment = "NEGATIVE";
        action = { status: "pending_approval", message: "Escalated for manager approval" };
    } else if (lower.includes("manager") || lower.includes("supervisor") || lower.includes("human") || lower.includes("escalate")) {
        response = "I completely understand your need to speak with a human agent. I've escalated your case to our support team. A senior support specialist will reach out to you within 30 minutes. Your case reference number is ESC-DEMO-001.";
        sentiment = "NEGATIVE";
        action = { status: "completed", message: "Escalated to human agent (Case: ESC-DEMO-001)", action: "escalate" };
    } else if (lower.includes("angry") || lower.includes("terrible") || lower.includes("worst") || lower.includes("frustrated")) {
        response = "I sincerely apologize for the frustration you're experiencing. Your satisfaction is our top priority, and I want to make this right. I've flagged your case as high priority and applied a $25 goodwill credit to your account. Would you like me to connect you with a senior specialist?";
        sentiment = "NEGATIVE";
        action = { status: "completed", message: "Account credit applied ($25.00)", action: "account_credit" };
    } else if (lower.includes("status") || lower.includes("order") || lower.includes("track")) {
        response = "I can help you check your order status! Your most recent order (ORD-2025-12345) is currently in transit and expected to arrive by tomorrow. You can track it in real-time using the tracking link sent to your email. Would you like me to look up a specific order?";
        sentiment = "NEUTRAL";
    } else if (lower.includes("thank") || lower.includes("great") || lower.includes("awesome") || lower.includes("helpful")) {
        response = "You're very welcome! I'm glad I could help. If you ever need assistance in the future, don't hesitate to reach out. Have a wonderful day!";
        sentiment = "POSITIVE";
    } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
        response = "Hello! Welcome to GeeksGreeks Support. I'm your AI support assistant. I can help you with refunds, password resets, order tracking, account issues, and much more. How can I assist you today?";
        sentiment = "POSITIVE";
    } else {
        response = "Thank you for your question! I've searched our knowledge base and here's what I found: Our team is available 24/7 to help with any issues. For specific account actions, I can process refunds, reset passwords, update cases, and escalate to human agents. Could you provide more details about what you need help with?";
        sentiment = "NEUTRAL";
    }

    return { response: response, sentiment: sentiment, actionTaken: action, sessionId: currentSessionId, intent: "general_query" };
}
