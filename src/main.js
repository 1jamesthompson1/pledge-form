import './style.css';
import { money, pledgeRules } from './pledge-config.js';

const STORAGE_KEY = `te-ra-pledge-form:${pledgeRules.year}`;
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
    'My child may be photographed at school, kindergarten / nursery and EOTC events.',
    'Photos may be published on the school website or newsletter using first name only.',
    'Photos may be displayed on social media without names.',
  ],
};

const app = document.querySelector('#app');
const userEditedAmounts = new Set();
const contactEmail = window.PLEDGE_CONFIG?.contactEmail || 'office@tera.school.nz';

function field(label, name, type = 'text', options = {}) {
  const control = type === 'textarea'
    ? `<textarea name="${name}" rows="4" ${options.required ? 'required' : ''}></textarea>`
    : `<input name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} />`;
  return `<label>${label}${options.required ? ' <span aria-hidden="true">*</span>' : ''}${control}</label>`;
}

function checklist(title, key, required = false) {
  return `<fieldset><legend>${title}</legend>${consentGroups[key].map((text, index) => `
    <label class="check"><input type="checkbox" name="${key}-${index}" ${required ? 'required' : ''} /> <span>${text}</span></label>`).join('')}</fieldset>`;
}

function dynamicChildren() {
  const existing = Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
  const schoolCount = Number(document.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(document.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const rows = (kind, count) => Array.from({ length: count }, (_, index) => {
    const title = kind === 'school' ? `School child ${index + 1}` : `Kindergarten / Nursery child ${index + 1}`;
    const details = kind === 'school' ? field('Class', `${kind}${index + 1}Class`, 'text', { required: true }) : `${field('Age', `${kind}${index + 1}Age`, 'number', { required: true, min: 0, max: 8 })}<label>Days per week<select name="${kind}${index + 1}Days" required><option value="5" selected>5 days</option><option value="3">3 days</option><option value="2">2 days</option></select></label>`;
    return `<div class="child-row"><strong>${title}</strong>${field('Child name', `${kind}${index + 1}Name`, 'text', { required: true })}${details}</div>`;
  }).join('');
  document.querySelector('#school-children').innerHTML = rows('school', schoolCount) || '<p class="muted">No school children added.</p>';
  document.querySelector('#kindergarten-children').innerHTML = rows('kindergarten', kindergartenCount) || '<p class="muted">No Kindergarten / Nursery children added.</p>';
  document.querySelector('#disbursement-note').textContent = `The ${pledgeRules.year} disbursement contribution is ${money(pledgeRules.disbursementPerChild)} per child.`;
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
    const amountName = `${kind}${number}Amount`;
    const selected = userEditedAmounts.has(amountName) ? currentAmount : recommended;
    const childName = form.querySelector(`[name="${sourceName}"]`)?.value.trim() || `${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${number}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${sourceName}">${childName}</span><span class="recommended">Recommended: ${money(recommended)}</span><input name="${kind}${number}Amount" type="number" min="0" step="0.01" value="${selected}" aria-label="Agreed amount for ${kind} child ${number}" required /></div>`;
  }).join('');
  document.querySelector('#pledge-rows').innerHTML = `${rows('school', schoolCount)}${rows('kindergarten', kindergartenCount)}` || '<p class="muted">Add students above to see pledge amounts.</p>';
  document.querySelector('#disbursement-rows').innerHTML = Array.from({ length: schoolCount + kindergartenCount }, (_, index) => {
    const source = index < schoolCount ? `school${index + 1}Name` : `kindergarten${index - schoolCount + 1}Name`;
    const fieldName = source.replace('Name', 'Disbursement');
    const current = form.querySelector(`[name="${fieldName}"]`)?.value || pledgeRules.disbursementPerChild;
    const childName = form.querySelector(`[name="${source}"]`)?.value.trim() || `Child ${index + 1}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${source}">${childName}</span><span class="recommended">Recommended: ${money(pledgeRules.disbursementPerChild)}</span><input name="${fieldName}" type="number" min="0" step="0.01" value="${current}" aria-label="Disbursement for child ${index + 1}" required /></div>`;
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
  panel.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = !toggle.checked; });
  if (!toggle.checked) return;
  const existing = Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
  const schoolCount = Number(document.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(document.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const children = [
    ...Array.from({ length: schoolCount }, (_, index) => ['school', index + 1]),
    ...Array.from({ length: kindergartenCount }, (_, index) => ['kindergarten', index + 1]),
  ];
  const countInput = document.querySelector('[name="custodyArrangementCount"]');
  let count = Number(countInput?.value || 0);
  if (count < 1) {
    count = 1;
    if (countInput) countInput.value = count;
  }
  document.querySelector('#custody-arrangements').innerHTML = Array.from({ length: count }, (_, index) => {
    const childrenCheckboxes = children.map(([kind, number]) => {
      const name = `${kind}${number}Name`;
      const label = document.querySelector(`[name="${name}"]`)?.value.trim() || `${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${number}`;
      const checkboxName = `custody-${index}-${kind}${number}`;
      return `<label class="check"><input type="checkbox" name="${checkboxName}" ${existing[checkboxName] ? 'checked' : ''} /> <span data-source="${name}">${label}</span></label>`;
    }).join('') || '<p class="muted">Add children in section 01 first.</p>';
    return `<div class="custody-arrangement">
      <h4>Custodial arrangement ${index + 1}</h4>
      <fieldset><legend>Select the children affected</legend>${childrenCheckboxes}</fieldset>
      ${field('What are the living arrangements for the affected children?', `custody-${index}-livingArrangements`, 'textarea', { required: true })}
      ${field('Is there anyone who does not have legal rights of access to the children? Please include their name and any relevant details, or write "None".', `custody-${index}-legalRestrictions`, 'textarea', { required: true })}
      ${field('What are the financial arrangements for the pledge, disbursements, camps and other costs?', `custody-${index}-financialArrangements`, 'textarea', { required: true })}
      ${field('Further details about the custodial arrangement', `custody-${index}-explanation`, 'textarea')}
      ${index > 0 ? `<button type="button" class="remove-custody-arrangement" data-index="${index}">Remove arrangement</button>` : ''}
    </div>`;
  }).join('');
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <h1>Special Character Pledge Form <em>${pledgeRules.year}</em></h1>
        <p class="intro">A digital version of the special character pledge form. Your progress is saved on this device while you complete the form.</p>
        <p class="draft-warning"><strong>Draft form:</strong> This form is currently in development and not yet live. Do not submit real pledges until this notice is removed.</p>
        <div class="status" role="status" aria-live="polite"><span class="status-dot"></span><span id="save-status">Ready to begin</span></div>
      </header>
      <form id="pledge-form">
        <section class="card accent-card">
          <div class="section-heading"><span>01</span><div><p class="eyebrow">Whanau details</p><h2>Who is completing this pledge?</h2></div></div>
          <div class="grid two">${field('Parent / guardian name', 'parentName', 'text', { required: true })}${field('Email address', 'email', 'email', { required: true })}</div>
          <h3>How many children are you completing this pledge for?</h3><div class="grid two"><label>School children<select name="schoolChildCount" required>${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label><label>Kindergarten / Nursery children<select name="kindergartenChildCount" required>${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label></div>
          <h3>School children</h3><div id="school-children"></div><h3>Kindergarten / Nursery children</h3><div id="kindergarten-children"></div>
        </section>

        <section class="card"><div class="section-heading"><span>02</span><div><p class="eyebrow">Care and participation</p><h2>Consents and commitments</h2></div></div>
          ${checklist('Medical consent', 'medical', true)}${checklist('EOTC blanket consent for local walks', 'eotc', true)}${checklist('Code of conduct and special character', 'conduct', true)}
        </section>

        <section class="card"><div class="section-heading"><span>03</span><div><p class="eyebrow">Contribution</p><h2>Our pledge for ${pledgeRules.year}</h2></div></div>
          <p class="muted">The contribution is donation-based. Recommended amounts are guidance, not fees. Please contact the Trust Administrator if you need to discuss financial hardship.</p>
          <p class="rule-note">School pricing: ${pledgeRules.school.note}</p>
          <p class="rule-note">Kindergarten pricing: ${pledgeRules.kindergarten.note}</p><h3>Pledge amounts</h3><div class="amount-table"><div class="amount-head"><span>Student</span><span>Recommended</span><span>Agreed amount</span></div><div id="pledge-rows"></div></div>${field('Supplementary donation / pay it forward', 'supplementaryDonation', 'number', { min: 0 })}<h3>Disbursement amounts</h3><div class="amount-table"><div class="amount-head"><span>Student</span><span>Contribution</span><span>Amount</span></div><div id="disbursement-rows"></div></div>${field('Disbursement contribution', 'disbursement', 'number', { min: 0, readonly: true })}<p id="disbursement-note" class="muted"></p>
           <div class="total-line">${field(`Total pledge for ${pledgeRules.year}`, 'totalPledge', 'number', { required: true, min: 0, readonly: true })}</div><div class="price-summary" aria-live="polite"><div><span>Per term</span><strong id="term-total">$0.00</strong><small>Total divided by ${pledgeRules.termsPerYear} terms</small></div><div><span>Per week (calendar year)</span><strong id="week-total">$0.00</strong><small>Total divided by ${pledgeRules.weeksPerYear} weeks</small></div></div>
           <fieldset><legend>Indicative payment plan</legend>${['Weekly', 'Fortnightly', 'Monthly', 'Termly', 'Lump sum'].map((label) => `<label class="check"><input type="radio" name="paymentPlan" value="${label}" required /> <span>${label}</span></label>`).join('')}</fieldset>
           ${field('Pledge comments', 'pledgeComments', 'textarea')}
        </section>

        <section class="card"><div class="section-heading"><span>04</span><div><p class="eyebrow">Communication</p><h2>Photo permissions</h2></div></div>${checklist('Please choose any permissions that apply', 'photos')}</section>

        <section class="card"><div class="section-heading"><span>05</span><div><p class="eyebrow">Be prepared</p><h2>Emergency contacts</h2></div></div>
          <p class="muted">Please provide two people the school can contact in an emergency. Keep these details up to date throughout the year.</p>
          <div class="emergency-contact"><h3>Contact 1</h3><div class="grid three">${field('Name', 'emergencyContact1Name', 'text', { required: true })}${field('Phone number', 'emergencyContact1Phone', 'tel', { required: true })}${field('Relationship', 'emergencyContact1Relationship', 'text', { required: true })}</div></div>
          <div class="emergency-contact"><h3>Contact 2</h3><div class="grid three">${field('Name', 'emergencyContact2Name', 'text', { required: true })}${field('Phone number', 'emergencyContact2Phone', 'tel', { required: true })}${field('Relationship', 'emergencyContact2Relationship', 'text', { required: true })}</div></div>
        </section>

        <section class="card"><div class="section-heading"><span>06</span><div><p class="eyebrow">Family arrangements</p><h2>Custodial arrangements</h2></div></div>
          <label class="check custody-toggle"><input type="checkbox" name="custodyApplies" /> <span>My children live across more than one household or have special custodial arrangements.</span></label>
          <div id="custody-details" hidden>
            <input type="hidden" name="custodyArrangementCount" value="0" />
            <div id="custody-arrangements"></div>
            <button type="button" id="add-custody-arrangement">Add another custodial arrangement</button>
          </div>
        </section>

        <section class="card sign-card"><div class="section-heading"><span>07</span><div><p class="eyebrow">Declaration</p><h2>Confirm and submit</h2></div></div>
          <p>I confirm that the information above is correct and that I will advise the school of changes.</p>
          <div class="grid two">${field('Parent / guardian signature (typed)', 'signature', 'text', { required: true })}${field('Date', 'signatureDate', 'date', { required: true })}</div>
          <button class="submit" type="submit">Submit pledge <span>↗</span></button>
          <p class="fine-print">Submissions are sent securely to the school’s configured service.</p>
        </section>
      </form>
      <footer><span>Whāngia te wairua o te tamaiti</span><a href="mailto:${contactEmail}">Questions? Contact the office</a></footer>
    </div>`;
}

function addCustodyArrangement() {
  const countInput = document.querySelector('[name="custodyArrangementCount"]');
  if (countInput) {
    countInput.value = Number(countInput.value || 0) + 1;
    updateCustodySection();
    syncLinkedNames();
    saveDraft();
  }
}

function removeCustodyArrangement(index) {
  const countInput = document.querySelector('[name="custodyArrangementCount"]');
  if (!countInput) return;
  const count = Number(countInput.value || 0);
  if (count <= 1) return;

  const form = document.querySelector('#pledge-form');
  const existing = Object.fromEntries(new FormData(form).entries());
  const newData = {};
  for (let j = 0; j < count; j += 1) {
    if (j === index) continue;
    const newIndex = j < index ? j : j - 1;
    Object.keys(existing).forEach((key) => {
      if (key.startsWith(`custody-${j}-`)) {
        const suffix = key.slice(`custody-${j}-`.length);
        newData[`custody-${newIndex}-${suffix}`] = existing[key];
      }
    });
  }

  countInput.value = count - 1;
  Object.entries(newData).forEach(([key, value]) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (input && input.type !== 'checkbox' && input.type !== 'radio') input.value = value;
    if (input && (input.type === 'checkbox' || input.type === 'radio')) input.checked = Boolean(value);
  });

  updateCustodySection();
  syncLinkedNames();
  saveDraft();
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
    const custodyCountInput = document.querySelector('[name="custodyArrangementCount"]');
    if (custodyCountInput && draft.custodyArrangementCount) custodyCountInput.value = draft.custodyArrangementCount;
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
  const weekTotal = annualTotal / pledgeRules.weeksPerYear;
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
document.title = `Special Character Pledge Form ${pledgeRules.year}`;
const form = document.querySelector('#pledge-form');
restoreDraft();
form.addEventListener('input', (event) => {
  if (event.target.name?.endsWith('Amount') || event.target.name?.endsWith('Disbursement')) {
    userEditedAmounts.add(event.target.name);
  }
  syncLinkedNames();
  calculateTotals();
  saveDraft();
});
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

document.querySelector('#add-custody-arrangement')?.addEventListener('click', addCustodyArrangement);
document.querySelector('#custody-arrangements')?.addEventListener('click', (event) => {
  if (event.target.classList.contains('remove-custody-arrangement')) {
    removeCustodyArrangement(Number(event.target.dataset.index));
  }
});

function loadDevAnswers() {
  const set = (name, value) => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const check = (name) => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const selectRadio = (name, value) => {
    const input = document.querySelector(`[name="${name}"][value="${value}"]`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  set('parentName', 'Test Parent');
  set('email', 'test@example.com');
  set('schoolChildCount', '2');
  set('kindergartenChildCount', '1');

  set('school1Name', 'School Child One');
  set('school1Class', 'Room 1');
  set('school2Name', 'School Child Two');
  set('school2Class', 'Room 2');
  set('kindergarten1Name', 'Kindy Child');
  set('kindergarten1Age', '4');
  set('kindergarten1Days', '3');

  ['medical', 'eotc', 'conduct'].forEach((key) => {
    consentGroups[key].forEach((_, index) => check(`${key}-${index}`));
  });

  selectRadio('paymentPlan', 'Monthly');

  set('emergencyContact1Name', 'Emergency One');
  set('emergencyContact1Phone', '021 000 0001');
  set('emergencyContact1Relationship', 'Aunt');
  set('emergencyContact2Name', 'Emergency Two');
  set('emergencyContact2Phone', '021 000 0002');
  set('emergencyContact2Relationship', 'Uncle');

  set('signature', 'Test Signature');
  set('signatureDate', new Date().toISOString().split('T')[0]);

  calculateTotals();
  saveDraft();
}

if (new URLSearchParams(window.location.search).has('dev')) {
  loadDevAnswers();
}
