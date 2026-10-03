"use strict";

(() => {
  const data = globalThis.PublicKiCadData;
  const $ = (id) => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  // GitHub's installation_id/setup_action query values are untrusted handoff data.
  // They deliberately do not enter access or navigation decisions here.
  const repository = query.get("repository");
  const ref = query.get("ref");
  const pull = query.get("pull");
  if (data.validRepository(repository)) $("repository").value = repository;
  if (data.validRef(ref)) $("ref").value = ref;
  if (validPull(pull)) $("pull").value = pull;

  function validPull(value) {
    return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  }
  function setStatus(message) { $("status").textContent = message; }
  function appLink(action, repository, value) {
    if (!data.validRepository(repository)) throw new Error("Enter a public repository as owner/name.");
    const url = new URL("./", location.href);
    url.search = "";
    url.searchParams.set("repository", repository);
    if (action === "review") {
      if (!validPull(value)) throw new Error("Enter a valid pull request number to review.");
      url.searchParams.set("pull", value);
    } else if (value) {
      if (!data.validRef(value)) throw new Error("Enter a valid branch or commit.");
      url.searchParams.set("ref", value);
    }
    return url.href;
  }
  $("openForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const action = event.submitter?.dataset.action === "review" ? "review" : "browse";
    try {
      const destination = appLink(action, $("repository").value.trim(),
        $(action === "review" ? "pull" : "ref").value.trim());
      setStatus("");
      location.assign(destination);
    } catch (error) { setStatus(error.message); }
  });
  fetch("/api/config", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((config) => {
      if (!config?.installUrl) return;
      const url = new URL(config.installUrl);
      if (url.protocol !== "https:" || url.hostname !== "github.com") return;
      $("installLink").href = url.href;
      $("installLink").hidden = false;
    }).catch(() => {});
})();
