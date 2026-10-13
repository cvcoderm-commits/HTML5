const scanType = document.getElementById("scanType");
const customField = document.getElementById("customField");
const imageInput = document.getElementById("imageInput");
const scanBtn = document.getElementById("scanBtn");
const result = document.getElementById("result");
const loader = document.getElementById("loader");
const fullText = document.getElementById("fullText");

scanType.addEventListener("change", () => {
  customField.style.display = scanType.value === "custom" ? "block" : "none";
});

function extractField(text, type, customKeyword = "") {
  const patterns = {
    name: /name[:\s]+(.+)/i,
    dob: /(date of birth|dob)[:\s]+(.+)/i,
    phone: /(\+?\d[\d\s-]{8,})/i,
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    invoice: /(invoice\s?(number|no)?[:\s#-]+[A-Z0-9-]+)/i,
    amount: /((₹|\$|€)?\s?\d+[\d,]*\.?\d{0,2})/i,
    passport: /([A-Z]\d{7,8})/i
  };

  if (type === "custom") {
    const regex = new RegExp(customKeyword + "[:\\s]+(.+)", "i");
    const match = text.match(regex);
    return match ? match[1] : "Not found";
  }

  const match = text.match(patterns[type]);
  if (!match) return "Not found";
  return match[match.length - 1];
}

scanBtn.addEventListener("click", async () => {
  const file = imageInput.files[0];
  if (!file) {
    alert("Please upload an image first.");
    return;
  }

  if (!scanType.value) {
    alert("Please select what to scan.");
    return;
  }

  loader.classList.remove("hidden");
  result.innerHTML = "";
  fullText.textContent = "";

  try {
    const { data: { text } } = await Tesseract.recognize(file, "eng");
    fullText.textContent = text;

    const keyword = customField.value.trim();
    const extracted = extractField(text, scanType.value, keyword);

    result.innerHTML = `<strong>Result:</strong> ${extracted}`;
  } catch (error) {
    result.innerHTML = "Error scanning image.";
    console.error(error);
  }

  loader.classList.add("hidden");
});
