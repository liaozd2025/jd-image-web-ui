(() => {
  document.querySelectorAll(".radio-group").forEach((group) => {
    const select = group.nextElementSibling;
    if (!select || select.tagName !== "SELECT") return;

    const syncButtons = () => {
      group.querySelectorAll(".radio-btn").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-val") === select.value);
      });
    };

    group.addEventListener("click", (event) => {
      const button = event.target.closest(".radio-btn");
      if (!button) return;
      select.value = button.getAttribute("data-val");
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    select.addEventListener("change", syncButtons);
    select.addEventListener("input", syncButtons);
    syncButtons();
  });
})();
