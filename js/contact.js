// Contact forms (homepage section and the "Get Started" pop-up on service
// pages). Both post to /api/contact. The form needs this script to obtain a
// CSRF token before it can be submitted.
(function () {
  const forms = document.querySelectorAll('[data-contact-form]');
  if (forms.length === 0) return;

  // ── CSRF token (double-submit cookie pattern) ──
  // The server also sets an HttpOnly cookie with the same token; on submit it
  // compares the two, which a cross-site attacker cannot forge because they
  // cannot read the token value returned here (blocked by same-origin policy).
  async function loadCsrfToken() {
    try {
      const res = await fetch('/api/csrf-token', { method: 'GET', credentials: 'same-origin' });
      if (!res.ok) throw new Error('CSRF token request failed');
      const data = await res.json();
      if (data.csrfToken) {
        document.querySelectorAll('[data-csrf]').forEach((input) => { input.value = data.csrfToken; });
      }
    } catch (err) {
      console.error('Could not load CSRF token:', err);
    }
  }

  // ── Phone formatting: (XXX) XXX-XXXX while typing ──
  document.querySelectorAll('input[name="phone"]').forEach((input) => {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 10);
      let formatted = digits;
      if (digits.length >= 7) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      else if (digits.length >= 4) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      else if (digits.length >= 1) formatted = `(${digits}`;
      input.value = formatted;
    });
  });

  forms.forEach((form) => {
    const submitBtn = form.querySelector('[type="submit"]');
    const submitLabel = submitBtn.innerHTML;
    const statusEl = form.querySelector('[data-form-status]');
    const csrfInput = form.querySelector('[data-csrf]');

    function setStatus(message) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle('hidden', !message);
    }

    function clearFieldErrors() {
      form.querySelectorAll('[data-error]').forEach((el) => {
        el.textContent = '';
        el.classList.add('hidden');
        const input = form.querySelector(`[name="${el.dataset.error}"]`);
        if (input) input.removeAttribute('aria-invalid');
      });
    }

    // errors: { fieldName: 'message', ... } returned from the Zod-validated API
    function showFieldErrors(errors) {
      Object.entries(errors || {}).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error="${field}"]`);
        if (el) {
          el.textContent = message;
          el.classList.remove('hidden');
        }
        const input = form.querySelector(`[name="${field}"]`);
        if (input) input.setAttribute('aria-invalid', 'true');
      });
    }

    // Quick browser-side check of required fields so people get instant
    // feedback. The server re-checks everything.
    function checkRequired() {
      const errors = {};
      form.querySelectorAll('[required]').forEach((input) => {
        if (!input.value.trim()) errors[input.name] = 'This field is required.';
        else if (input.type === 'email' && !input.checkValidity()) errors[input.name] = 'Enter a valid email address.';
      });
      return errors;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors();
      setStatus('');

      const localErrors = checkRequired();
      if (Object.keys(localErrors).length > 0) {
        showFieldErrors(localErrors);
        return;
      }

      if (!csrfInput || !csrfInput.value) {
        setStatus('Please refresh the page before submitting the form.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.services = formData.getAll('services');

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfInput.value,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 429) {
          setStatus('Too many requests. Please wait a moment and try again.');
        } else if (!res.ok) {
          if (data.fieldErrors) {
            showFieldErrors(data.fieldErrors);
            setStatus('Please correct the highlighted fields.');
          } else {
            setStatus('Something went wrong sending your message. Please try again, or email us at jelevenmedia@gmail.com.');
          }
        } else {
          form.reset();
          setStatus('Message sent! We’ll be in touch soon.');
          submitBtn.textContent = 'Message sent!';
          loadCsrfToken(); // fresh token for a possible second message
          setTimeout(() => {
            submitBtn.innerHTML = submitLabel;
            submitBtn.disabled = false;
          }, 4000);
          return;
        }
      } catch (err) {
        console.error('Contact form submission failed:', err);
        setStatus('Something went wrong sending your message. Please try again, or email us at jelevenmedia@gmail.com.');
      }
      submitBtn.innerHTML = submitLabel;
      submitBtn.disabled = false;
    });
  });

  // ── "Get Started" pop-up ──
  // Links marked data-contact-modal point at /#contact, so they still work
  // without JavaScript; with it, they open the pop-up on the current page.
  const modal = document.getElementById('contact-modal');
  if (modal) {
    let lastFocus = null;

    const close = () => {
      modal.hidden = true;
      document.body.classList.remove('overflow-hidden');
      if (lastFocus) lastFocus.focus();
    };

    document.querySelectorAll('[data-contact-modal]').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        lastFocus = trigger;
        modal.hidden = false;
        document.body.classList.add('overflow-hidden');
        const first = modal.querySelector('input:not([type="hidden"]):not([tabindex="-1"])');
        if (first) first.focus();
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  }

  loadCsrfToken();
})();
