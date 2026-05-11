/*
  منصة قياس رضا المواطن السوداني — خدمات القنصلية بجازان
  منطق صفحة المواطن وإرسال التقييم إلى Supabase
*/

// إعدادات Supabase واضحة أعلى الملف كما هو مطلوب.
const SUPABASE_URL = "https://ynjulkvlqajmqsabujzp.supabase.co";
const SUPABASE_KEY = "sb_publishable_sxoxcY4fmz5cc0RqlngNEA_XXul-wMu";
const TABLE_NAME = "citizen_satisfaction_surveys";

// مدة منع التكرار السريع من نفس الجهاز: 6 ساعات.
const SUBMISSION_LOCK_HOURS = 6;
const SUBMISSION_LOCK_KEY = "sudanese_consulate_survey_last_submission";

const ratingLabels = {
  1: "ضعيف",
  2: "مقبول",
  3: "جيد",
  4: "جيد جداً",
  5: "ممتاز"
};

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const surveyForm = document.getElementById("surveyForm");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");
const surveySection = document.getElementById("surveySection");
const thankYouSection = document.getElementById("thankYouSection");
const referenceBox = document.getElementById("referenceBox");
const newSurveyButton = document.getElementById("newSurveyButton");

// إنشاء النجوم التفاعلية لكل حقل تقييم.
function initializeRatings() {
  document.querySelectorAll("[data-rating-field]").forEach((field) => {
    const ratingName = field.dataset.name;
    const ratingContainer = field.querySelector(".star-rating");
    const hiddenInput = field.querySelector(`input[name="${ratingName}"]`);
    const textElement = document.createElement("span");

    textElement.className = "rating-text";
    textElement.textContent = "لم يتم الاختيار";
    ratingContainer.appendChild(textElement);

    for (let value = 1; value <= 5; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "star-button";
      button.textContent = "★";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      button.setAttribute("aria-label", `${ratingLabels[value]}، ${toArabicNumber(value)} من ٥`);
      button.dataset.value = String(value);

      button.addEventListener("click", () => {
        setRating(field, hiddenInput, textElement, value);
      });

      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setRating(field, hiddenInput, textElement, value);
        }
      });

      ratingContainer.insertBefore(button, textElement);
    }
  });
}

function setRating(field, hiddenInput, textElement, selectedValue) {
  hiddenInput.value = String(selectedValue);
  field.querySelectorAll(".star-button").forEach((button) => {
    const value = Number(button.dataset.value);
    const active = value <= selectedValue;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", value === selectedValue ? "true" : "false");
  });
  textElement.textContent = ratingLabels[selectedValue];
}

function toArabicNumber(value) {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
}

function generateReferenceNumber() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `JZN-${stamp}-${randomPart}`;
}

function sanitizeText(value, maxLength = 900) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseRating(formData, name) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function hasRecentSubmission() {
  const saved = localStorage.getItem(SUBMISSION_LOCK_KEY);
  if (!saved) return false;
  const savedTime = Number(saved);
  if (!Number.isFinite(savedTime)) return false;
  const hoursPassed = (Date.now() - savedTime) / (1000 * 60 * 60);
  return hoursPassed < SUBMISSION_LOCK_HOURS;
}

function setRecentSubmissionLock() {
  localStorage.setItem(SUBMISSION_LOCK_KEY, String(Date.now()));
}

function showMessage(type, text) {
  formMessage.className = `status-message show ${type}`;
  formMessage.textContent = text;
}

function clearMessage() {
  formMessage.className = "status-message";
  formMessage.textContent = "";
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.querySelector(".button-text").textContent = isLoading ? "جارٍ إرسال التقييم" : "إرسال التقييم";
  submitButton.querySelector(".loading-spinner").classList.toggle("hidden", !isLoading);
}

function validatePayload(payload) {
  if (!payload.service_type) return "يرجى اختيار نوع الخدمة.";
  if (!payload.overall_rating) return "يرجى اختيار التقييم العام قبل الإرسال.";
  if (!payload.completed_status) return "يرجى تحديد حالة إنجاز المعاملة.";
  if (!payload.waiting_time) return "يرجى اختيار مدة الانتظار.";
  return "";
}

surveyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (hasRecentSubmission()) {
    showMessage("error", "تم تسجيل تقييم من هذا الجهاز مؤخراً. يرجى المحاولة لاحقاً حتى لا تتكرر النتائج.");
    return;
  }

  const formData = new FormData(surveyForm);
  const payload = {
    reference_no: generateReferenceNumber(),
    service_type: sanitizeText(formData.get("service_type"), 120),
    overall_rating: parseRating(formData, "overall_rating"),
    speed_rating: parseRating(formData, "speed_rating"),
    staff_rating: parseRating(formData, "staff_rating"),
    clarity_rating: parseRating(formData, "clarity_rating"),
    organization_rating: parseRating(formData, "organization_rating"),
    communication_rating: parseRating(formData, "communication_rating"),
    completed_status: sanitizeText(formData.get("completed_status"), 30),
    waiting_time: sanitizeText(formData.get("waiting_time"), 60),
    notes: sanitizeText(formData.get("notes"), 900) || null,
    phone: sanitizeText(formData.get("phone"), 30) || null,
    user_agent: navigator.userAgent.slice(0, 500)
  };

  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    showMessage("error", validationMessage);
    return;
  }

  setLoading(true);

  try {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .insert(payload);

    if (error) {
      throw error;
    }

    setRecentSubmissionLock();
    referenceBox.textContent = payload.reference_no;
    surveySection.classList.add("hidden");
    thankYouSection.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("خطأ في إرسال التقييم:", error);
    showMessage("error", "تعذر إرسال التقييم بسبب مشكلة في الاتصال أو إعدادات قاعدة البيانات. يرجى المحاولة مرة أخرى أو التواصل مع الإدارة.");
  } finally {
    setLoading(false);
  }
});

newSurveyButton.addEventListener("click", () => {
  showMessage("error", "لضمان دقة النتائج، يمكن إرسال تقييم جديد من نفس الجهاز بعد مرور فترة قصيرة.");
  thankYouSection.classList.add("hidden");
  surveySection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// تسجيل عامل الخدمة حتى يعمل التطبيق كتطبيق ويب تقدمي عند رفعه على خادم يدعم HTTPS.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // عدم إظهار خطأ للمواطن لأن عامل الخدمة ميزة إضافية وليست شرطاً لإرسال التقييم.
    });
  });
}

initializeRatings();
