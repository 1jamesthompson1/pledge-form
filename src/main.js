import './style.css';
import { money, pledgeRules } from './pledge-config.js';

const STORAGE_KEY = 'te-ra-pledge-form:2026';
const consentGroups = {
  medical: [
    'In an emergency, school staff may act on my behalf.',
    'School staff may administer pain relief, such as paracetamol, after seeking verbal permission.',
    'Basic first aid may be given, including an icepack, plaster, arnica cream or hypercal cream.',
    'I will tell the school about changes in my child\'s medical circumstances.',
  ],
  conduct: [
    'Treat others with respect and uphold their privacy.',
    'Work in partnership with staff for the benefit of all students.',
    'Respect and adhere to the school values and special character.',
    'Use digital technology and social media safely and responsibly.',
    'Act in accordance with school rules, procedures and legal obligations.',
  ],
  eotc: [
    'I agree to my child taking part in local walks.',
    'I understand that risks are associated with EOTC activities and cannot be completely eliminated.',
    'I understand that the school will identify hazards and manage those risks.',
    'I understand that I can ask the school questions about activities.',
  ],
  photos: [
    'My child may be photographed at school, kindergarten and EOTC events.',
    'Photos may be published on the school website or newsletter using first name only.',
    'Photos may be displayed on social media without names.',
  ],
};

const app = document.querySelector('#app');

function field(label, name, type = 'text', options = {}) {
  const control = type === 'textarea'
    ? `<textarea name="${name}" rows="4" ${options.required ? 'required' : ''}></textarea>`
    : `<input name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} />`;
  return `<label>${label}${options.required ? ' <span aria-hidden="true">*</span>' : ''}${control}</label>`;
}

function checklist(title, key) {
  return `<fieldset><legend>${title}</legend>${consentGroups[key].map((text, index) => `
    <label class="check"><input type="checkbox" name="${key}-${index}" /> <span>${text}</span></label>`).join('')}</fieldset>`;
}

function dynamicChildren() {
  const existing = Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
  const schoolCount = Number(document.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(document.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const rows = (kind, count) => Array.from({ length: count }, (_, index) => {
    const title = kind === 'school' ? `School child ${index + 1}` : `Kindergarten child ${index + 1}`;
    const details = kind === 'school' ? field('Class', `${kind}${index + 1}Class`) : `<label>Days per week<select name="${kind}${index + 1}Days"><option value="5" selected>5 days</option><option value="3">3 days</option><option value="2">2 days</option></select></label>`;
    return `<div class="child-row"><strong>${title}</strong>${field('Child name', `${kind}${index + 1}Name`)}${details}</div>`;
  }).join('');
  document.querySelector('#school-children').innerHTML = rows('school', schoolCount) || '<p class="muted">No school children added.</p>';
  document.querySelector('#kindergarten-children').innerHTML = rows('kindergarten', kindergartenCount) || '<p class="muted">No kindergarten children added.</p>';
  document.querySelector('#disbursement-note').textContent = `The 2026 disbursement contribution is ${money(pledgeRules.disbursementPerChild)} per child.`;
  Object.entries(existing).forEach(([name, value]) => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) input.value = value;
  });
  dynamicContributionRows();
}

function dynamicContributionRows() {
  const form = document.querySelector('#pledge-form');
  const schoolCount = Number(form.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(form.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const rows = (kind, count) => Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const sourceName = `${kind}${number}Name`;
    const currentAmount = form.querySelector(`[name="${kind}${number}Amount"]`)?.value;
    const days = form.querySelector(`[name="kindergarten${number}Days"]`)?.value || 5;
    const recommended = kind === 'school'
      ? pledgeRules.school.recommendedByChild[index] || pledgeRules.school.recommendedByChild.at(-1)
      : pledgeRules.kindergarten.recommendedByDays[days];
    const selected = currentAmount || recommended;
    const childName = form.querySelector(`[name="${sourceName}"]`)?.value.trim() || `${kind === 'school' ? 'School' : 'Kindergarten'} child ${number}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${sourceName}">${childName}</span><span class="recommended">Recommended: ${money(recommended)}</span><input name="${kind}${number}Amount" type="number" min="0" step="0.01" value="${selected}" aria-label="Agreed amount for ${kind} child ${number}" /></div>`;
  }).join('');
  document.querySelector('#pledge-rows').innerHTML = `${rows('school', schoolCount)}${rows('kindergarten', kindergartenCount)}` || '<p class="muted">Add students above to see pledge amounts.</p>';
  document.querySelector('#disbursement-rows').innerHTML = Array.from({ length: schoolCount + kindergartenCount }, (_, index) => {
    const source = index < schoolCount ? `school${index + 1}Name` : `kindergarten${index - schoolCount + 1}Name`;
    const fieldName = source.replace('Name', 'Disbursement');
    const current = form.querySelector(`[name="${fieldName}"]`)?.value || pledgeRules.disbursementPerChild;
    const childName = form.querySelector(`[name="${source}"]`)?.value.trim() || `Child ${index + 1}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${source}">${childName}</span><span class="recommended">Recommended: ${money(pledgeRules.disbursementPerChild)}</span><input name="${fieldName}" type="number" min="0" step="0.01" value="${current}" aria-label="Disbursement for child ${index + 1}" /></div>`;
  }).join('') || '<p class="muted">Add students above to see disbursement amounts.</p>';
  syncLinkedNames();
}

function syncLinkedNames() {
  document.querySelectorAll('[data-source]').forEach((element) => {
    const source = document.querySelector(`[name="${element.dataset.source}"]`);
    element.textContent = source?.value.trim() || 'Unnamed child';
  });
}

function updateCustodySection() {
  const toggle = document.querySelector('[name="custodyApplies"]');
  const panel = document.querySelector('#custody-details');
  if (!toggle || !panel) return;
  panel.hidden = !toggle.checked;
  if (!toggle.checked) return;
  const existing = Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
  const schoolCount = Number(document.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(document.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const children = [
    ...Array.from({ length: schoolCount }, (_, index) => ['school', index + 1]),
    ...Array.from({ length: kindergartenCount }, (_, index) => ['kindergarten', index + 1]),
  ];
  document.querySelector('#custody-children').innerHTML = children.map(([kind, number]) => {
    const name = `${kind}${number}Name`;
    const label = document.querySelector(`[name="${name}"]`)?.value.trim() || `${kind === 'school' ? 'School' : 'Kindergarten'} child ${number}`;
    return `<label class="check"><input type="checkbox" name="custody-${kind}${number}" ${existing[`custody-${kind}${number}`] ? 'checked' : ''} /> <span data-source="${name}">${label}</span></label>`;
  }).join('') || '<p class="muted">Add children in section 01 first.</p>';
  const explanation = existing.custodyExplanation || '';
  document.querySelector('#custody-explanation').value = explanation;
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <p class="eyebrow">Te Ra School & Te Rawhiti Kindergarten</p>
        <h1>Special Character Pledge Form <em>2026</em></h1>
        <p class="intro">A digital version of the family pledge book. Your progress is saved on this device while you complete the form.</p>
        <div class="status" role="status" aria-live="polite"><span class="status-dot"></span><span id="save-status">Ready to begin</span></div>
      </header>
      <form id="pledge-form">
        <section class="card accent-card">
          <div class="section-heading"><span>01</span><div><p class="eyebrow">Whanau details</p><h2>Who is completing this pledge?</h2></div></div>
          <div class="grid two">${field('Parent / guardian name', 'parentName', 'text', { required: true })}${field('Email address', 'email', 'email', { required: true })}</div>
          <h3>How many children are you completing this pledge for?</h3><div class="grid two"><label>School children<select name="schoolChildCount">${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label><label>Kindergarten children<select name="kindergartenChildCount">${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label></div>
          <h3>School children</h3><div id="school-children"></div><h3>Kindergarten children</h3><div id="kindergarten-children"></div>
        </section>

        <section class="card"><div class="section-heading"><span>02</span><div><p class="eyebrow">Care and participation</p><h2>Consents and commitments</h2></div></div>
          ${checklist('Medical consent', 'medical')}${checklist('EOTC blanket consent for local walks', 'eotc')}${checklist('Code of conduct and special character', 'conduct')}
        </section>

        <section class="card"><div class="section-heading"><span>03</span><div><p class="eyebrow">Contribution</p><h2>Our pledge for 2026</h2></div></div>
          <p class="muted">The contribution is donation-based. Recommended amounts are guidance, not fees. Please contact the Trust Administrator if you need to discuss financial hardship.</p>
          <p class="rule-note">School pricing: ${pledgeRules.school.note}</p><h3>Pledge amounts</h3><div class="amount-table"><div class="amount-head"><span>Student</span><span>Recommended</span><span>Agreed amount</span></div><div id="pledge-rows"></div></div><h3>Disbursement amounts</h3><div class="amount-table"><div class="amount-head"><span>Student</span><span>Contribution</span><span>Amount</span></div><div id="disbursement-rows"></div></div><div class="grid two">${field('Disbursement contribution', 'disbursement', 'number', { min: 0, readonly: true })}${field('Supplementary donation / pay it forward', 'supplementaryDonation', 'number', { min: 0 })}</div><p id="disbursement-note" class="muted"></p>
          <div class="total-line">${field('Total pledge for 2026', 'totalPledge', 'number', { required: true, min: 0, readonly: true })}</div><div class="price-summary" aria-live="polite"><div><span>Per term</span><strong id="term-total">$0.00</strong><small>Total divided by ${pledgeRules.termsPerYear} terms</small></div><div><span>Estimated per week</span><strong id="week-total">$0.00</strong><small>Per term divided by ${pledgeRules.weeksPerTerm} weeks</small></div></div>
          <fieldset><legend>Payment plan</legend>${['Monthly payments', 'Paid in full by 31 March', 'Other schedule as arranged'].map((label, i) => `<label class="check"><input type="radio" name="paymentPlan" value="${label}" ${i === 0 ? 'required' : ''} /> <span>${label}</span></label>`).join('')}</fieldset>
          ${field('Further comments about our pledge', 'comments', 'textarea')}
        </section>

        <section class="card"><div class="section-heading"><span>04</span><div><p class="eyebrow">Communication</p><h2>Photo permissions</h2></div></div>${checklist('Please choose any permissions that apply', 'photos')}</section>

        <section class="card"><div class="section-heading"><span>05</span><div><p class="eyebrow">Be prepared</p><h2>Emergency contacts</h2></div></div>
          <p class="muted">Please provide two people the school can contact in an emergency. Keep these details up to date throughout the year.</p>
          <div class="emergency-contact"><h3>Contact 1</h3><div class="grid three">${field('Name', 'emergencyContact1Name', 'text', { required: true })}${field('Phone number', 'emergencyContact1Phone', 'tel', { required: true })}${field('Relationship', 'emergencyContact1Relationship', 'text', { required: true })}</div></div>
          <div class="emergency-contact"><h3>Contact 2</h3><div class="grid three">${field('Name', 'emergencyContact2Name', 'text', { required: true })}${field('Phone number', 'emergencyContact2Phone', 'tel', { required: true })}${field('Relationship', 'emergencyContact2Relationship', 'text', { required: true })}</div></div>
        </section>

        <section class="card"><div class="section-heading"><span>06</span><div><p class="eyebrow">Family arrangements</p><h2>Custodial arrangements</h2></div></div>
          <label class="check custody-toggle"><input type="checkbox" name="custodyApplies" /> <span>My children live across more than one household or have special custodial arrangements.</span></label>
          <div id="custody-details" hidden><fieldset><legend>Select the children affected</legend><div id="custody-children"></div></fieldset>${field('Please explain the arrangement', 'custodyExplanation', 'textarea', { required: true })}</div>
        </section>

        <section class="card sign-card"><div class="section-heading"><span>07</span><div><p class="eyebrow">Declaration</p><h2>Confirm and submit</h2></div></div>
          <p>I confirm that the information above is correct and that I will advise the school of changes.</p>
          <div class="grid two">${field('Parent / guardian signature (typed)', 'signature', 'text', { required: true })}${field('Date', 'signatureDate', 'date', { required: true })}</div>
          <button class="submit" type="submit">Submit pledge <span>↗</span></button>
          <p class="fine-print">Submissions are sent securely to the school’s configured service. Do not use this form for urgent medical updates.</p>
        </section>
      </form>
      <footer><span>Whāngia te wairua o te tamaiti</span><a href="mailto:office@tera.school.nz">Questions? Contact the office</a></footer>
    </div>`;
}

function formData() {
  return Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData()));
    document.querySelector('#save-status').textContent = 'Draft saved locally';
  } catch {
    document.querySelector('#save-status').textContent = 'Local saving unavailable';
  }
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    ['schoolChildCount', 'kindergartenChildCount'].forEach((name) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (input && draft[name]) input.value = draft[name];
    });
    dynamicChildren();
    const custodyToggle = document.querySelector('[name="custodyApplies"]');
    if (custodyToggle) custodyToggle.checked = Boolean(draft.custodyApplies);
    updateCustodySection();
    Object.entries(draft).forEach(([name, value]) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (input && input.type !== 'checkbox' && input.type !== 'radio') input.value = value;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) input.checked = true;
    });
    if (Object.keys(draft).length) document.querySelector('#save-status').textContent = 'Draft restored from this device';
    calculateTotals();
  } catch { /* Ignore malformed or unavailable local drafts. */ }
}

function calculateTotals() {
  const form = document.querySelector('#pledge-form');
  const amountTotal = [...form.querySelectorAll('input[name$="Amount"]')].reduce((total, input) => total + Number(input.value || 0), 0);
  const disbursement = form.querySelector('[name="disbursement"]');
  const disbursementTotal = [...form.querySelectorAll('input[name$="Disbursement"]')].reduce((total, input) => total + Number(input.value || 0), 0);
  const donation = Number(form.querySelector('[name="supplementaryDonation"]')?.value || 0);
  if (disbursement) disbursement.value = disbursementTotal;
  const total = form.querySelector('[name="totalPledge"]');
  if (total) total.value = amountTotal + disbursementTotal + donation;
  const annualTotal = Number(total?.value || 0);
  const termTotal = annualTotal / pledgeRules.termsPerYear;
  const weekTotal = termTotal / pledgeRules.weeksPerTerm;
  document.querySelector('#term-total').textContent = money(termTotal);
  document.querySelector('#week-total').textContent = money(weekTotal);
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const endpoint = new URLSearchParams(window.location.search).get('endpoint') || window.PLEDGE_CONFIG?.submitUrl;
  const button = form.querySelector('.submit');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    if (!endpoint) throw new Error('No submission endpoint configured');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: formData(), submittedAt: new Date().toISOString() }) });
    if (!response.ok) throw new Error(`Submission failed (${response.status})`);
    localStorage.removeItem(STORAGE_KEY);
    form.innerHTML = '<div class="success"><span class="success-mark">✓</span><p class="eyebrow">Pledge received</p><h2>Thank you, your pledge has been submitted.</h2><p>The school will be in touch if anything needs clarification.</p></div>';
    document.querySelector('#save-status').textContent = 'Submitted successfully';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Submit pledge ↗';
    document.querySelector('#save-status').textContent = error.message;
  }
}

render();
const form = document.querySelector('#pledge-form');
restoreDraft();
form.addEventListener('input', () => { syncLinkedNames(); calculateTotals(); saveDraft(); });
form.addEventListener('change', (event) => {
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount') dynamicChildren();
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount' || event.target.name === 'custodyApplies') updateCustodySection();
  if (/^kindergarten\d+Days$/.test(event.target.name)) {
    const amount = pledgeRules.kindergarten.recommendedByDays[event.target.value];
    const amountInput = document.querySelector(`[name="${event.target.name.replace('Days', 'Amount')}"]`);
    if (amountInput) amountInput.value = amount;
    dynamicContributionRows();
  }
  syncLinkedNames();
  calculateTotals();
  saveDraft();
});
form.addEventListener('submit', submit);
dynamicChildren();
calculateTotals();
