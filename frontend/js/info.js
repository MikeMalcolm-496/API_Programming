// Contact form: opens the visitor's email app with the message filled in.
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const TO = 'lostandfound@strathmore.edu'; // EDIT: your real contact email
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const subject = `Lost & Found enquiry from ${v('cName')}`;
    const body = `${v('cMsg')}\n\nReply to: ${v('cEmail')}`;
    window.location.href = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
})();
