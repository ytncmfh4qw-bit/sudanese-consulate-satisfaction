/*
  منصة قياس رضا المواطن السوداني — خدمات القنصلية بجازان
  منطق لوحة الإدارة والتحليلات
*/

// إعدادات Supabase واضحة أعلى الملف كما هو مطلوب.
const SUPABASE_URL = "https://ynjulkvlqajmqsabujzp.supabase.co";
const SUPABASE_KEY = "sb_publishable_sxoxcY4fmz5cc0RqlngNEA_XXul-wMu";
const TABLE_NAME = "citizen_satisfaction_surveys";

// تعتمد لوحة الإدارة على Supabase Auth وسياسات RLS في قاعدة البيانات.
// يجب أن يكون بريد المدير موجوداً في جدول public.survey_admins.

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const loginForm = document.getElementById("loginForm");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");
const adminMessage = document.getElementById("adminMessage");
const refreshButton = document.getElementById("refreshButton");
const exportButton = document.getElementById("exportButton");
const printButton = document.getElementById("printButton");
const logoutButton = document.getElementById("logoutButton");
const searchInput = document.getElementById("searchInput");
const serviceFilter = document.getElementById("serviceFilter");
const statusFilter = document.getElementById("statusFilter");
const surveysTableBody = document.getElementById("surveysTableBody");
const printReportSummary = document.getElementById("printReportSummary");

let allSurveys = [];
let filteredSurveys = [];
let charts = {};

const ratingFields = [
  { key: "overall_rating", label: "الرضا العام", statId: "avgOverall" },
  { key: "speed_rating", label: "سرعة الخدمة", statId: "avgSpeed" },
  { key: "staff_rating", label: "تعامل الموظفين", statId: "avgStaff" },
  { key: "clarity_rating", label: "وضوح الإجراءات", statId: "avgClarity" },
  { key: "organization_rating", label: "تنظيم الحضور", statId: "avgOrganization" },
  { key: "communication_rating", label: "جودة التواصل", statId: "avgCommunication" }
];

function toArabicNumber(value) {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
}

function formatNumber(value) {
  return toArabicNumber(value);
}

function formatAverage(value) {
  if (!Number.isFinite(value)) return "٠";
  return toArabicNumber(value.toFixed(2));
}

function showStatus(element, type, text) {
  element.className = `status-message show ${type}`;
  element.textContent = text;
}

function clearStatus(element) {
  element.className = "status-message";
  element.textContent = "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function average(items, key) {
  const values = items
    .map((item) => Number(item[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(items, key) {
  return items.reduce((accumulator, item) => {
    const value = item[key] || "غير محدد";
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function percentage(count, total) {
  if (!total) return "٠٪";
  return `${toArabicNumber(((count / total) * 100).toFixed(1))}٪`;
}

function getTopEntries(items, key, limit = 5) {
  return Object.entries(countBy(items, key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getTopService(items) {
  const counts = countBy(items, "service_type");
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "—";
}

function formatDate(dateValue) {
  if (!dateValue) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateValue));
}

function completionBadge(status) {
  const classes = {
    "نعم": "badge-success",
    "جزئياً": "badge-warning",
    "لا": "badge-danger"
  };
  return `<span class="badge ${classes[status] || "badge-warning"}">${escapeHtml(status || "—")}</span>`;
}

async function authenticate() {
  clearStatus(loginMessage);
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("خطأ التحقق من الجلسة:", error);
    showLoginPanel();
    return;
  }

  if (data?.session) {
    openAdminPanel();
  } else {
    showLoginPanel();
  }
}

function showLoginPanel() {
  adminSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
}

function openAdminPanel() {
  loginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
  loadSurveys();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(loginMessage);

  const email = adminEmail.value.trim();
  const password = adminPassword.value;

  if (!email || !password) {
    showStatus(loginMessage, "error", "يرجى إدخال البريد الإلكتروني وكلمة المرور.");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "جارٍ تسجيل الدخول...";

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    adminPassword.value = "";
    openAdminPanel();
  } catch (error) {
    console.error("خطأ تسجيل دخول الإدارة:", error);
    showStatus(loginMessage, "error", "تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور ومن إضافة البريد إلى جدول المديرين.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "دخول اللوحة";
  }
});

async function loadSurveys() {
  clearStatus(adminMessage);
  refreshButton.disabled = true;
  surveysTableBody.innerHTML = `<tr><td colspan="14">جارٍ تحميل البيانات...</td></tr>`;

  try {
    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allSurveys = Array.isArray(data) ? data : [];
    applyFilters();
    showStatus(adminMessage, "success", "تم تحديث البيانات بنجاح.");
  } catch (error) {
    console.error("خطأ تحميل بيانات الإدارة:", error);
    surveysTableBody.innerHTML = `<tr><td colspan="14">تعذر تحميل البيانات. تأكد من تسجيل الدخول بحساب مدير وتنفيذ سياسات قاعدة البيانات.</td></tr>`;
    showStatus(adminMessage, "error", "تعذر قراءة التقييمات. تأكد من أن بريد حسابك موجود في جدول survey_admins وأن سياسات Supabase منفذة.");
  } finally {
    refreshButton.disabled = false;
  }
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedService = serviceFilter.value;
  const selectedStatus = statusFilter.value;

  filteredSurveys = allSurveys.filter((item) => {
    const matchesQuery = !query || [item.phone, item.service_type, item.notes, item.reference_no]
      .some((value) => String(value || "").toLowerCase().includes(query));
    const matchesService = !selectedService || item.service_type === selectedService;
    const matchesStatus = !selectedStatus || item.completed_status === selectedStatus;
    return matchesQuery && matchesService && matchesStatus;
  });

  updateStats(filteredSurveys);
  renderCharts(filteredSurveys);
  renderTable(filteredSurveys);
  renderPrintSummary(filteredSurveys);
}

function updateStats(items) {
  document.getElementById("totalCount").textContent = formatNumber(items.length);
  ratingFields.forEach((field) => {
    document.getElementById(field.statId).textContent = formatAverage(average(items, field.key));
  });
  document.getElementById("completedCount").textContent = formatNumber(items.filter((item) => item.completed_status === "نعم").length);
  document.getElementById("notCompletedCount").textContent = formatNumber(items.filter((item) => item.completed_status === "لا").length);
  document.getElementById("topService").textContent = getTopService(items);
}

function chartColors() {
  return ["#064b35", "#c9a227", "#0f7a50", "#b7791f", "#86a39a", "#033324"];
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function renderCharts(items) {
  const font = { family: "Tajawal", size: 13, weight: "700" };
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font } }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { font }
      },
      x: {
        ticks: { font }
      }
    }
  };

  destroyChart("ratings");
  charts.ratings = new Chart(document.getElementById("ratingsChart"), {
    type: "bar",
    data: {
      labels: ratingFields.map((field) => field.label),
      datasets: [{
        label: "متوسط التقييم من ٥",
        data: ratingFields.map((field) => Number(average(items, field.key).toFixed(2))),
        backgroundColor: chartColors()
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        y: { beginAtZero: true, max: 5, ticks: { font } },
        x: { ticks: { font } }
      }
    }
  });

  renderPieChart("services", "servicesChart", "service_type", "توزيع أنواع الخدمات", items, font);
  renderPieChart("completion", "completionChart", "completed_status", "حالة إنجاز المعاملة", items, font);
  renderPieChart("waiting", "waitingChart", "waiting_time", "مدة الانتظار", items, font);
}

function renderPieChart(chartKey, canvasId, dataKey, label, items, font) {
  destroyChart(chartKey);
  const counts = countBy(items, dataKey);
  charts[chartKey] = new Chart(document.getElementById(canvasId), {
    type: "doughnut",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        label,
        data: Object.values(counts),
        backgroundColor: chartColors(),
        borderColor: "#ffffff",
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font } }
      }
    }
  });
}

function renderPrintSummary(items) {
  if (!printReportSummary) return;

  const total = items.length;
  const completed = items.filter((item) => item.completed_status === "نعم").length;
  const partial = items.filter((item) => item.completed_status === "جزئياً").length;
  const notCompleted = items.filter((item) => item.completed_status === "لا").length;
  const overallAverage = average(items, "overall_rating");
  const ratingsRows = ratingFields.map((field) => `
    <tr>
      <td>${escapeHtml(field.label)}</td>
      <td>${formatAverage(average(items, field.key))} / ٥</td>
    </tr>
  `).join("");

  const distributionRows = (key) => {
    const entries = getTopEntries(items, key);
    if (!entries.length) {
      return `<tr><td colspan="3">لا توجد بيانات كافية.</td></tr>`;
    }
    return entries.map(([label, count]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${formatNumber(count)}</td>
        <td>${percentage(count, total)}</td>
      </tr>
    `).join("");
  };

  const visibleNotes = items
    .filter((item) => String(item.notes || "").trim())
    .slice(0, 6)
    .map((item) => `
      <li>
        <strong>${escapeHtml(item.reference_no || "تقييم")}</strong>
        <span>${escapeHtml(item.notes)}</span>
      </li>
    `).join("");

  printReportSummary.innerHTML = `
    <div class="report-intro">
      <h2>ملخص تنفيذي للطباعة</h2>
      <p>يعرض هذا التقرير ملخصًا إداريًا للتقييمات الظاهرة حاليًا في لوحة الإدارة حسب البحث والفلاتر المحددة. تم استبعاد الجدول التفصيلي الطويل من نسخة الطباعة لتسهيل القراءة واتخاذ القرار.</p>
    </div>

    <div class="print-kpi-grid">
      <div><span>عدد التقييمات</span><strong>${formatNumber(total)}</strong></div>
      <div><span>متوسط الرضا العام</span><strong>${formatAverage(overallAverage)} / ٥</strong></div>
      <div><span>نسبة المعاملات المنجزة</span><strong>${percentage(completed, total)}</strong></div>
      <div><span>أكثر خدمة تقييمًا</span><strong>${escapeHtml(getTopService(items))}</strong></div>
    </div>

    <div class="print-two-columns">
      <section>
        <h3>متوسطات محاور الرضا</h3>
        <table class="print-table compact-table">
          <tbody>${ratingsRows}</tbody>
        </table>
      </section>
      <section>
        <h3>حالة إنجاز المعاملة</h3>
        <table class="print-table compact-table">
          <thead><tr><th>الحالة</th><th>العدد</th><th>النسبة</th></tr></thead>
          <tbody>
            <tr><td>نعم</td><td>${formatNumber(completed)}</td><td>${percentage(completed, total)}</td></tr>
            <tr><td>جزئياً</td><td>${formatNumber(partial)}</td><td>${percentage(partial, total)}</td></tr>
            <tr><td>لا</td><td>${formatNumber(notCompleted)}</td><td>${percentage(notCompleted, total)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>

    <div class="print-two-columns">
      <section>
        <h3>توزيع أنواع الخدمات</h3>
        <table class="print-table compact-table">
          <thead><tr><th>الخدمة</th><th>العدد</th><th>النسبة</th></tr></thead>
          <tbody>${distributionRows("service_type")}</tbody>
        </table>
      </section>
      <section>
        <h3>مدة الانتظار</h3>
        <table class="print-table compact-table">
          <thead><tr><th>المدة</th><th>العدد</th><th>النسبة</th></tr></thead>
          <tbody>${distributionRows("waiting_time")}</tbody>
        </table>
      </section>
    </div>

    <section class="print-notes-section">
      <h3>نماذج مختصرة من الملاحظات</h3>
      ${visibleNotes ? `<ul class="print-notes">${visibleNotes}</ul>` : `<p class="muted-print-text">لا توجد ملاحظات نصية ضمن النتائج الحالية.</p>`}
    </section>
  `;
}

function renderTable(items) {
  if (!items.length) {
    surveysTableBody.innerHTML = `<tr><td colspan="14">لا توجد تقييمات مطابقة للبحث أو الفلاتر الحالية.</td></tr>`;
    return;
  }

  surveysTableBody.innerHTML = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.reference_no)}</td>
      <td>${escapeHtml(formatDate(item.created_at))}</td>
      <td>${escapeHtml(item.service_type)}</td>
      <td>${formatNumber(item.overall_rating || "—")}</td>
      <td>${formatNumber(item.speed_rating || "—")}</td>
      <td>${formatNumber(item.staff_rating || "—")}</td>
      <td>${formatNumber(item.clarity_rating || "—")}</td>
      <td>${formatNumber(item.organization_rating || "—")}</td>
      <td>${formatNumber(item.communication_rating || "—")}</td>
      <td>${completionBadge(item.completed_status)}</td>
      <td>${escapeHtml(item.waiting_time || "—")}</td>
      <td>${escapeHtml(item.phone || "—")}</td>
      <td>${escapeHtml(item.notes || "—")}</td>
      <td class="no-print">
        <button class="btn btn-danger" type="button" data-delete-id="${escapeHtml(item.id)}">حذف</button>
      </td>
    </tr>
  `).join("");
}

async function deleteSurvey(id) {
  const confirmed = window.confirm("هل أنت متأكد من حذف هذا التقييم؟ لا يمكن التراجع عن العملية.");
  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .delete()
      .eq("id", id);

    if (error) throw error;

    allSurveys = allSurveys.filter((item) => item.id !== id);
    applyFilters();
    showStatus(adminMessage, "success", "تم حذف التقييم بنجاح.");
  } catch (error) {
    console.error("خطأ حذف التقييم:", error);
    showStatus(adminMessage, "error", "تعذر حذف التقييم. تأكد من سياسة الحذف في قاعدة البيانات.");
  }
}

function exportCsv() {
  const headers = [
    "الرقم المرجعي", "التاريخ", "نوع الخدمة", "الرضا العام", "السرعة", "الموظفون",
    "الإجراءات", "التنظيم", "التواصل", "الإنجاز", "الانتظار", "الجوال", "الملاحظات"
  ];

  const rows = filteredSurveys.map((item) => [
    item.reference_no,
    formatDate(item.created_at),
    item.service_type,
    item.overall_rating,
    item.speed_rating,
    item.staff_rating,
    item.clarity_rating,
    item.organization_rating,
    item.communication_rating,
    item.completed_status,
    item.waiting_time,
    item.phone || "",
    item.notes || ""
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير-رضا-المواطن-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printReport() {
  document.getElementById("printDate").textContent = `تاريخ التقرير: ${formatDate(new Date().toISOString())}`;
  renderPrintSummary(filteredSurveys);
  window.print();
}

refreshButton.addEventListener("click", loadSurveys);
exportButton.addEventListener("click", exportCsv);
printButton.addEventListener("click", printReport);
logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  allSurveys = [];
  filteredSurveys = [];
  Object.keys(charts).forEach(destroyChart);
  showLoginPanel();
  showStatus(loginMessage, "success", "تم تسجيل الخروج بنجاح.");
});
searchInput.addEventListener("input", applyFilters);
serviceFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

surveysTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (button) {
    deleteSurvey(button.dataset.deleteId);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // عامل الخدمة ميزة إضافية، ولا يؤثر فشل تسجيله على عمل لوحة الإدارة.
    });
  });
}

authenticate();
