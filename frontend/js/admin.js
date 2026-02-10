let currentTab = "rules";

document.addEventListener("DOMContentLoaded", function () {
    loadConfig();
    initAdmin();
});

function initAdmin() {
    updateAdminNavbar();
    loadStats();
    loadRules();
    loadEscalations();
}

function updateAdminNavbar() {
    const user = getCurrentUser();
    const nav = document.getElementById("navbar");
    if (nav && user) {
        const userArea = nav.querySelector(".navbar-user");
        if (userArea) {
            const initial = (user.name || user.email || "A")[0].toUpperCase();
            userArea.innerHTML = '<div class="avatar">' + initial + '</div><span>' + (user.name || user.email) + '</span><button class="btn btn-sm btn-outline" onclick="logout()" style="margin-left:8px;color:white;border-color:rgba(255,255,255,0.3)">Logout</button>';
        }
    }
}

function switchTab(tab) {
    currentTab = tab;
    var tabs = document.querySelectorAll(".tab");
    tabs.forEach(function (t) { t.classList.remove("active"); });
    var activeTab = document.querySelector('[data-tab="' + tab + '"]');
    if (activeTab) activeTab.classList.add("active");

    document.getElementById("rules-section").style.display = tab === "rules" ? "block" : "none";
    document.getElementById("escalations-section").style.display = tab === "escalations" ? "block" : "none";
}

async function loadStats() {
    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        renderStats({ totalRules: 8, activeRules: 6, openEscalations: 3, resolvedToday: 12 });
        return;
    }

    try {
        var rulesData = await apiCall("/rules", "GET");
        var escData = await apiCall("/escalations", "GET");

        var rules = rulesData.rules || [];
        var escalations = escData.escalations || [];
        var activeRules = rules.filter(function (r) { return r.isActive; }).length;
        var openEsc = escalations.filter(function (e) { return e.status === "open"; }).length;
        var resolved = escalations.filter(function (e) { return e.status === "resolved"; }).length;

        renderStats({ totalRules: rules.length, activeRules: activeRules, openEscalations: openEsc, resolvedToday: resolved });
    } catch (err) {
        showToast("Error loading stats: " + err.message, "error");
    }
}

function renderStats(stats) {
    document.getElementById("stat-total-rules").textContent = stats.totalRules;
    document.getElementById("stat-active-rules").textContent = stats.activeRules;
    document.getElementById("stat-open-escalations").textContent = stats.openEscalations;
    document.getElementById("stat-resolved").textContent = stats.resolvedToday;
}

async function loadRules() {
    var tableBody = document.getElementById("rules-table-body");

    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        var demoRules = getDemoRules();
        renderRulesTable(demoRules);
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';
        var data = await apiCall("/rules", "GET");
        renderRulesTable(data.rules || []);
    } catch (err) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger)">Error loading rules: ' + err.message + '</td></tr>';
    }
}

function renderRulesTable(rules) {
    var tableBody = document.getElementById("rules-table-body");

    if (rules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-light)">No rules found. Click "Add Rule" to create one.</td></tr>';
        return;
    }

    tableBody.innerHTML = rules.map(function (rule) {
        var keywords = Array.isArray(rule.keywords) ? rule.keywords.join(", ") : rule.keywords;
        var statusClass = rule.isActive ? "badge-active" : "badge-inactive";
        var statusText = rule.isActive ? "Active" : "Inactive";
        var priorityClass = "badge-" + (rule.priority || "medium");

        return '<tr>' +
            '<td><strong>' + escapeHtmlAdmin(rule.name) + '</strong></td>' +
            '<td>' + escapeHtmlAdmin(rule.category) + '</td>' +
            '<td><code>' + escapeHtmlAdmin(keywords) + '</code></td>' +
            '<td><span class="badge ' + priorityClass + '">' + (rule.priority || "medium") + '</span></td>' +
            '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
            '<td>' +
                '<button class="btn btn-sm btn-outline" onclick=\'editRule(' + JSON.stringify(JSON.stringify(rule)) + ')\'>Edit</button> ' +
                '<button class="btn btn-sm btn-danger" onclick="deleteRule(\'' + rule.ruleId + '\')">Delete</button>' +
            '</td>' +
        '</tr>';
    }).join("");
}

async function loadEscalations() {
    var tableBody = document.getElementById("escalations-table-body");

    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        renderEscalationsTable(getDemoEscalations());
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';
        var data = await apiCall("/escalations", "GET");
        renderEscalationsTable(data.escalations || []);
    } catch (err) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger)">Error loading escalations: ' + err.message + '</td></tr>';
    }
}

function renderEscalationsTable(escalations) {
    var tableBody = document.getElementById("escalations-table-body");

    if (escalations.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-light)">No escalations found.</td></tr>';
        return;
    }

    tableBody.innerHTML = escalations.map(function (esc) {
        var statusClass = "badge-" + esc.status;
        var priorityClass = "badge-" + (esc.priority || "medium");
        var date = esc.createdAt ? new Date(esc.createdAt * 1000).toLocaleString() : "N/A";

        return '<tr>' +
            '<td><code>' + escapeHtmlAdmin(esc.escalationId || "").substring(0, 8) + '...</code></td>' +
            '<td>' + escapeHtmlAdmin(esc.reason || "") + '</td>' +
            '<td><span class="badge ' + priorityClass + '">' + (esc.priority || "medium") + '</span></td>' +
            '<td><span class="badge ' + statusClass + '">' + esc.status + '</span></td>' +
            '<td>' + date + '</td>' +
            '<td>' +
                (esc.status === "open" ? '<button class="btn btn-sm btn-success" onclick="resolveEscalation(\'' + esc.escalationId + '\')">Resolve</button>' : '<span style="color:var(--text-light)">--</span>') +
            '</td>' +
        '</tr>';
    }).join("");
}

function showAddRuleModal() {
    var overlay = document.getElementById("rule-modal");
    document.getElementById("modal-title").textContent = "Add New Rule";
    document.getElementById("rule-form").reset();
    document.getElementById("rule-id-field").value = "";
    overlay.classList.add("visible");
}

function editRule(ruleJson) {
    var rule = JSON.parse(ruleJson);
    var overlay = document.getElementById("rule-modal");
    document.getElementById("modal-title").textContent = "Edit Rule";
    document.getElementById("rule-id-field").value = rule.ruleId;
    document.getElementById("rule-name").value = rule.name || "";
    document.getElementById("rule-category").value = rule.category || "";
    document.getElementById("rule-keywords").value = Array.isArray(rule.keywords) ? rule.keywords.join(", ") : (rule.keywords || "");
    document.getElementById("rule-response").value = rule.response || "";
    document.getElementById("rule-action").value = rule.action || "";
    document.getElementById("rule-priority").value = rule.priority || "medium";
    document.getElementById("rule-active").checked = rule.isActive !== false;
    overlay.classList.add("visible");
}

function closeRuleModal() {
    document.getElementById("rule-modal").classList.remove("visible");
}

async function saveRule() {
    var ruleId = document.getElementById("rule-id-field").value;
    var keywords = document.getElementById("rule-keywords").value;
    var keywordsList = keywords.split(",").map(function (k) { return k.trim(); }).filter(function (k) { return k; });

    var ruleData = {
        name: document.getElementById("rule-name").value.trim(),
        category: document.getElementById("rule-category").value.trim(),
        keywords: keywordsList,
        response: document.getElementById("rule-response").value.trim(),
        action: document.getElementById("rule-action").value.trim() || null,
        priority: document.getElementById("rule-priority").value,
        isActive: document.getElementById("rule-active").checked,
    };

    if (!ruleData.name || !ruleData.category || keywordsList.length === 0 || !ruleData.response) {
        showToast("Please fill in all required fields", "error");
        return;
    }

    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        showToast(ruleId ? "Rule updated (demo mode)" : "Rule created (demo mode)", "success");
        closeRuleModal();
        return;
    }

    try {
        if (ruleId) {
            await apiCall("/rules/" + ruleId, "PUT", ruleData);
            showToast("Rule updated successfully", "success");
        } else {
            await apiCall("/rules", "POST", ruleData);
            showToast("Rule created successfully", "success");
        }
        closeRuleModal();
        loadRules();
        loadStats();
    } catch (err) {
        showToast("Error saving rule: " + err.message, "error");
    }
}

async function deleteRule(ruleId) {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        showToast("Rule deleted (demo mode)", "success");
        return;
    }

    try {
        await apiCall("/rules/" + ruleId, "DELETE");
        showToast("Rule deleted", "success");
        loadRules();
        loadStats();
    } catch (err) {
        showToast("Error deleting rule: " + err.message, "error");
    }
}

async function resolveEscalation(escalationId) {
    var resolution = prompt("Enter resolution notes:");
    if (resolution === null) return;

    if (APP_CONFIG.apiUrl === "demo" || !APP_CONFIG.apiUrl) {
        showToast("Escalation resolved (demo mode)", "success");
        return;
    }

    try {
        await apiCall("/escalations/" + escalationId, "PUT", {
            status: "resolved",
            resolution: resolution,
        });
        showToast("Escalation resolved", "success");
        loadEscalations();
        loadStats();
    } catch (err) {
        showToast("Error resolving escalation: " + err.message, "error");
    }
}

function getDemoRules() {
    return [
        { ruleId: "rule-001", name: "Refund Policy", category: "billing", keywords: ["refund", "money back", "return"], response: "Our refund policy allows returns within 30 days of purchase.", action: "refund", priority: "high", isActive: true },
        { ruleId: "rule-002", name: "Password Reset", category: "account", keywords: ["password", "reset", "login"], response: "I can help reset your password via email verification.", action: "reset_password", priority: "medium", isActive: true },
        { ruleId: "rule-003", name: "Shipping Info", category: "orders", keywords: ["shipping", "delivery", "track"], response: "Standard shipping takes 3-5 business days. Express is 1-2 days.", priority: "low", isActive: true },
        { ruleId: "rule-004", name: "Account Cancellation", category: "account", keywords: ["cancel", "close account", "unsubscribe"], response: "Account cancellation requires manager approval.", action: "cancel_subscription", priority: "high", isActive: true },
        { ruleId: "rule-005", name: "Technical Support", category: "technical", keywords: ["bug", "error", "not working", "broken"], response: "I'll create a technical support ticket for our engineering team.", action: "escalate", priority: "medium", isActive: true },
        { ruleId: "rule-006", name: "Billing Inquiry", category: "billing", keywords: ["charge", "bill", "invoice", "payment"], response: "I can look up your billing details and recent charges.", priority: "medium", isActive: true },
        { ruleId: "rule-007", name: "Promo Code", category: "billing", keywords: ["promo", "coupon", "discount code"], response: "You can apply promo codes at checkout.", priority: "low", isActive: false },
        { ruleId: "rule-008", name: "VIP Escalation", category: "escalation", keywords: ["vip", "premium", "priority"], response: "VIP customers receive priority support.", action: "escalate", priority: "high", isActive: true },
    ];
}

function getDemoEscalations() {
    var now = Math.floor(Date.now() / 1000);
    return [
        { escalationId: "esc-demo-001", reason: "Customer requested subscription cancellation", priority: "high", status: "open", createdAt: now - 3600, userId: "user-101" },
        { escalationId: "esc-demo-002", reason: "High negative sentiment detected", priority: "high", status: "open", createdAt: now - 7200, userId: "user-205" },
        { escalationId: "esc-demo-003", reason: "Refund amount exceeds auto-approval limit ($150)", priority: "medium", status: "open", createdAt: now - 10800, userId: "user-089" },
        { escalationId: "esc-demo-004", reason: "Technical issue - app crash reported", priority: "medium", status: "resolved", createdAt: now - 86400, userId: "user-312" },
        { escalationId: "esc-demo-005", reason: "VIP customer complaint", priority: "high", status: "resolved", createdAt: now - 172800, userId: "user-007" },
    ];
}

function escapeHtmlAdmin(text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
}
