// Contact page form (/contact). Shows one step at a time when JavaScript is
// on (without it, every step shows at once and the form still submits).
// Posts to /api/contact, which needs a CSRF token fetched first.
(function () {
  document.documentElement.classList.add('js');

  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const csrfInput = form.querySelector('[data-csrf]');
  const statusEl = form.querySelector('[data-form-status]');
  const submitBtn = form.querySelector('[type="submit"]');
  const submitLabel = submitBtn.innerHTML;
  const success = document.querySelector('[data-form-success]');

  // ── CSRF token (double-submit cookie pattern) ──
  // The server also sets an HttpOnly cookie with the same token; on submit it
  // compares the two, which a cross-site attacker cannot forge because they
  // cannot read the token value returned here (blocked by same-origin policy).
  async function loadCsrfToken() {
    try {
      const res = await fetch('/api/csrf-token', { method: 'GET', credentials: 'same-origin' });
      if (!res.ok) throw new Error('CSRF token request failed');
      const data = await res.json();
      if (data.csrfToken && csrfInput) csrfInput.value = data.csrfToken;
    } catch (err) {
      console.error('Could not load CSRF token:', err);
    }
  }

  // ── Phone formatting: (XXX) XXX-XXXX while typing ──
  form.querySelectorAll('input[name="phone"]').forEach((input) => {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 10);
      let formatted = digits;
      if (digits.length >= 7) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      else if (digits.length >= 4) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      else if (digits.length >= 1) formatted = `(${digits}`;
      input.value = formatted;
    });
  });

  // ── Steps ──
  const steps = Array.from(form.querySelectorAll('[data-step]'));
  const progress = form.querySelector('[data-progress]');
  const progressBar = form.querySelector('[data-progress-bar]');
  const stepLabel = form.querySelector('[data-step-label]');
  let current = 0;

  function showStep(i, focus) {
    current = i;
    steps.forEach((step, n) => { step.hidden = n !== i; });
    if (progressBar) progressBar.style.width = `${((i + 1) / steps.length) * 100}%`;
    if (stepLabel) stepLabel.textContent = `Step ${i + 1} of ${steps.length} · ${steps[i].dataset.stepName}`;
    if (focus) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = steps[i].querySelector('input:not([type="hidden"]), select, textarea');
      if (first) first.focus({ preventScroll: true });
    }
  }

  if (steps.length > 1) {
    if (progress) progress.hidden = false;
    form.querySelectorAll('[data-next], [data-back]').forEach((btn) => { btn.hidden = false; });
    showStep(0, false);

    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) {
        clearFieldErrors();
        setStatus('');
        const errors = checkRequired(steps[current]);
        if (Object.keys(errors).length > 0) {
          showFieldErrors(errors);
          return;
        }
        showStep(current + 1, true);
      } else if (e.target.closest('[data-back]')) {
        showStep(current - 1, true);
      }
    });
  }

  // Jump to the step holding the first field that has an error.
  function goToError(errors) {
    const field = Object.keys(errors)[0];
    const input = field && form.querySelector(`[name="${field}"]`);
    const step = input && input.closest('[data-step]');
    if (step && steps.length > 1) showStep(steps.indexOf(step), true);
  }

  // ── Errors and status ──
  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('hidden', !message);
  }

  function clearFieldErrors() {
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = '';
      el.classList.add('hidden');
      form.querySelectorAll(`[name="${el.dataset.error}"]`).forEach((input) => input.removeAttribute('aria-invalid'));
    });
  }

  // errors: { fieldName: 'message', ... } from checkRequired or the Zod-validated API
  function showFieldErrors(errors) {
    Object.entries(errors || {}).forEach(([field, message]) => {
      const el = form.querySelector(`[data-error="${field}"]`);
      if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
      }
      form.querySelectorAll(`[name="${field}"]`).forEach((input) => input.setAttribute('aria-invalid', 'true'));
    });
  }

  // Quick browser-side check of required fields so people get instant
  // feedback. The server re-checks everything.
  function checkRequired(scope) {
    const errors = {};
    scope.querySelectorAll('[required]').forEach((input) => {
      if (!input.value.trim()) errors[input.name] = 'This field is required.';
      else if (input.type === 'email' && !input.checkValidity()) errors[input.name] = 'Enter a valid email address.';
    });
    return errors;
  }

  // Checkbox groups are sent as lists; everything else as text.
  function collect() {
    const data = new FormData(form);
    const payload = {};
    const lists = new Set(Array.from(form.querySelectorAll('input[type="checkbox"]')).map((c) => c.name));
    for (const key of new Set(data.keys())) {
      payload[key] = lists.has(key) ? data.getAll(key) : data.get(key);
    }
    lists.forEach((key) => { if (!payload[key]) payload[key] = []; });
    return payload;
  }

  // ── Submit ──
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors();
    setStatus('');

    const localErrors = checkRequired(form);
    if (Object.keys(localErrors).length > 0) {
      showFieldErrors(localErrors);
      goToError(localErrors);
      return;
    }

    if (!csrfInput || !csrfInput.value) {
      setStatus('Please refresh the page before submitting the form.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfInput.value },
        body: JSON.stringify(collect()),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        form.hidden = true;
        if (success) {
          success.hidden = false;
          success.focus();
        }
        return;
      }
      if (res.status === 429) {
        setStatus('Too many requests. Please wait a moment and try again.');
      } else if (data.fieldErrors) {
        showFieldErrors(data.fieldErrors);
        goToError(data.fieldErrors);
        setStatus('Please correct the highlighted fields.');
      } else {
        setStatus('Something went wrong sending your details. Please try again, or call (865) 684-0526.');
      }
    } catch (err) {
      console.error('Contact form submission failed:', err);
      setStatus('Something went wrong sending your details. Please try again, or call (865) 684-0526.');
    }
    submitBtn.innerHTML = submitLabel;
    submitBtn.disabled = false;
  });

  loadCsrfToken();
})();
