var API_URL = "YOUR_API_GATEWAY_URL_HERE";

var sessionId = generateSessionId();
var isWaiting = false;

document.addEventListener("DOMContentLoaded", function () {
    var messageInput = document.getElementById("messageInput");
    messageInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter" && !isWaiting) {
            sendMessage();
        }
    });

    document.getElementById("adminToggle").addEventListener("click", toggleAdmin);
    document.getElementById("backToChat").addEventListener("click", toggleAdmin);
    document.getElementById("newChat").addEventListener("click", newChat);

    loadRules();
});

function generateSessionId() {
    return (
        "session-" +
        Date.now() +
        "-" +
        Math.random().toString(36).substr(2, 9)
    );
}

function sendQuickMessage(message) {
    document.getElementById("messageInput").value = message;
    sendMessage();
}

function sendMessage() {
    var input = document.getElementById("messageInput");
    var message = input.value.trim();

    if (!message || isWaiting) return;

    addMessage(message, "user");
    input.value = "";
    isWaiting = true;
    document.getElementById("sendBtn").disabled = true;

    showTypingIndicator();

    fetch(API_URL + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: message,
            session_id: sessionId,
            user_id: "demo-user",
        }),
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(
                    "API request failed with status " + response.status
                );
            }
            return response.json();
        })
        .then(function (data) {
            removeTypingIndicator();
            addMessage(data.response, "bot");

            if (data.escalated) {
                addEscalationBanner(data.escalation_id);
            }
        })
        .catch(function (error) {
            removeTypingIndicator();
            console.error("Error:", error);
            addMessage(
                "Sorry, I'm having trouble connecting to the server. Please check your connection and try again.",
                "bot"
            );
        })
        .finally(function () {
            isWaiting = false;
            document.getElementById("sendBtn").disabled = false;
            input.focus();
        });
}

function addMessage(text, type) {
    var messagesDiv = document.getElementById("chatMessages");
    var messageDiv = document.createElement("div");
    messageDiv.className = "message " + type;

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = type === "bot" ? "\u{1F916}" : "\u{1F464}";

    var content = document.createElement("div");
    content.className = "message-content";

    var formattedText = text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>")
        .replace(/- (.*?)(?=<br>|$)/g, "<li>$1</li>");

    if (formattedText.indexOf("<li>") !== -1) {
        formattedText = formattedText.replace(
            /(<li>.*<\/li>)/g,
            "<ul>$1</ul>"
        );
    }

    content.innerHTML = formattedText;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesDiv.appendChild(messageDiv);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addEscalationBanner(escalationId) {
    var messagesDiv = document.getElementById("chatMessages");
    var banner = document.createElement("div");
    banner.className = "escalation-banner";
    banner.innerHTML =
        "This conversation has been escalated to a human agent. " +
        "Escalation ID: <strong>" +
        (escalationId || "pending") +
        "</strong>. " +
        "An agent will reach out to you shortly.";
    messagesDiv.appendChild(banner);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator() {
    var messagesDiv = document.getElementById("chatMessages");
    var typingDiv = document.createElement("div");
    typingDiv.className = "message bot";
    typingDiv.id = "typingIndicator";

    typingDiv.innerHTML =
        '<div class="message-avatar">\u{1F916}</div>' +
        '<div class="message-content">' +
        '<div class="typing-indicator">' +
        "<span></span><span></span><span></span>" +
        "</div></div>";

    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
    var indicator = document.getElementById("typingIndicator");
    if (indicator) indicator.remove();
}

function newChat() {
    sessionId = generateSessionId();
    var messagesDiv = document.getElementById("chatMessages");
    messagesDiv.innerHTML =
        '<div class="message bot">' +
        '<div class="message-avatar">\u{1F916}</div>' +
        '<div class="message-content">' +
        "<p>Hello! I'm your AI Support Copilot. How can I help you today?</p>" +
        "</div></div>";
}

function toggleAdmin() {
    var chatPanel = document.getElementById("chatPanel");
    var adminPanel = document.getElementById("adminPanel");
    chatPanel.classList.toggle("hidden");
    adminPanel.classList.toggle("hidden");

    if (!adminPanel.classList.contains("hidden")) {
        loadRules();
    }
}

function loadRules() {
    fetch(API_URL + "/rules", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    })
        .then(function (response) {
            if (!response.ok) return;
            return response.json();
        })
        .then(function (data) {
            if (data) {
                displayRules(data.rules || []);
            }
        })
        .catch(function (error) {
            console.error("Error loading rules:", error);
            displayRules([]);
        });
}

function displayRules(rules) {
    var rulesList = document.getElementById("rulesList");

    if (rules.length === 0) {
        rulesList.innerHTML =
            '<p style="color: #999; text-align: center; padding: 20px;">No rules configured yet. Add your first rule above.</p>';
        return;
    }

    rulesList.innerHTML = rules
        .map(function (rule) {
            var badgeClass = rule.auto_approve ? "auto" : "manual";
            var badgeText = rule.auto_approve ? "Auto" : "Manual";
            return (
                '<div class="rule-card">' +
                '<div class="rule-info">' +
                "<h4>" +
                (rule.rule_name || "Unnamed Rule") +
                "</h4>" +
                "<p>Action: " +
                (rule.action || "N/A") +
                " | Condition: " +
                (rule.condition || "N/A") +
                " | Max: $" +
                (rule.max_amount || "0") +
                "</p>" +
                "</div>" +
                '<div class="rule-actions">' +
                '<span class="rule-badge ' +
                badgeClass +
                '">' +
                badgeText +
                "</span> " +
                '<button class="btn-danger" onclick="deleteRule(\'' +
                rule.rule_id +
                "')\">" +
                "Delete</button>" +
                "</div></div>"
            );
        })
        .join("");
}

function addRule() {
    var ruleName = document.getElementById("ruleName").value;
    var ruleAction = document.getElementById("ruleAction").value;
    var ruleCondition = document.getElementById("ruleCondition").value;
    var ruleMaxAmount = document.getElementById("ruleMaxAmount").value;
    var ruleAutoApprove = document.getElementById("ruleAutoApprove").checked;

    if (!ruleName) {
        alert("Rule name is required");
        return;
    }

    fetch(API_URL + "/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            rule_name: ruleName,
            action: ruleAction,
            condition: ruleCondition,
            max_amount: parseInt(ruleMaxAmount, 10) || 0,
            auto_approve: ruleAutoApprove,
            requires_approval: !ruleAutoApprove,
        }),
    })
        .then(function (response) {
            if (response.ok) {
                document.getElementById("ruleName").value = "";
                document.getElementById("ruleCondition").value = "";
                document.getElementById("ruleMaxAmount").value = "";
                document.getElementById("ruleAutoApprove").checked = false;
                loadRules();
            }
        })
        .catch(function (error) {
            console.error("Error adding rule:", error);
            alert("Failed to add rule. Check console for details.");
        });
}

function deleteRule(ruleId) {
    if (!confirm("Delete this rule?")) return;

    fetch(API_URL + "/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_id: ruleId }),
    })
        .then(function () {
            loadRules();
        })
        .catch(function (error) {
            console.error("Error deleting rule:", error);
        });
}
