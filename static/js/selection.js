document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("productTypeSelect");

  select.addEventListener("change", () => {
    const selectedValue = select.value;
    if (selectedValue) {
      window.location.href = selectedValue;
    }
  });
});
