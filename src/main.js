import './style.css';
import { money, pledgeRules } from './pledge-config.js';
import {
  interpolate, formatLongDate, formatLongDateOrdinal, sections, sectionTitle, consentGroups,
  eotcStatementsSchool, eotcStatementsKindergarten, eotcLegends, labels, childWord,
  theirFacePhrase, trustAdministratorPhrase,
} from './form-definition.js';
import examplePledge from './example-data.json';
import privacyStatementHtml from './privacy-statement.html?raw';

const STORAGE_KEY = `te-ra-pledge-form:${pledgeRules.year}`;

const app = document.querySelector('#app');
const userEditedAmounts = new Set();
let submitted = false;
const contactEmail = window.PLEDGE_CONFIG?.contactEmail;
const trustAdministrator = trustAdministratorPhrase(contactEmail);
const submitUrl = window.PLEDGE_CONFIG?.submitUrl;
const formVersion = typeof __FORM_VERSION__ === 'string' ? __FORM_VERSION__ : '';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
const FORM_LOAD_TIME = Date.now();
const MIN_FILL_TIME_MS = 5000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const isDev = window.PLEDGE_CONFIG?.dev === true;
const isDraft = window.PLEDGE_CONFIG?.draft === true;
const successHTML = '<div class="success"><span class="success-mark">✓</span><p class="eyebrow">Pledge received</p><h2>Thank you, your pledge has been submitted.</h2><p>The school will be in touch if anything needs clarification.</p></div>';
const params = new URLSearchParams(window.location.search);
const isAdmin = ['1', 'true'].includes(params.get('admin'));
const startDateParam = params.get('startDate') || params.get('startdate');
const parseStartDate = (raw) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = raw.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};
const firstTermStart = pledgeRules.schoolYear?.terms?.[0]?.start;
const firstTermStartLabel = formatLongDate(firstTermStart);
const totalSchoolWeeks = (() => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!terms.length) return pledgeRules.weeksPerYear;
  return terms.reduce((total, term) => {
    const start = new Date(`${term.start}T00:00:00`);
    const end = new Date(`${term.end}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;
    return total + Math.ceil(days / 7);
  }, 0);
})();
const schoolYearMonths = (() => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!terms.length) return 12;
  const start = new Date(`${terms[0].start}T00:00:00`);
  const end = new Date(`${terms.at(-1).end}T00:00:00`);
  return end.getMonth() - start.getMonth() + 1;
})();
const paymentPlanOptions = [
  { key: 'week', label: 'Weekly' },
  { key: 'fortnight', label: 'Fortnightly' },
  { key: 'month', label: 'Monthly' },
  { key: 'term', label: 'Termly' },
  { key: 'lump', label: 'Lump sum' },
  { key: 'other', label: 'Other' },
];
const fullPeriods = {
  weeks: totalSchoolWeeks,
  factor: 1,
  terms: pledgeRules.termsPerYear,
  spanWeeks: pledgeRules.schoolYearWeeks,
  months: schoolYearMonths,
};
const computeScaling = (date) => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!date || !terms.length) return { ...fullPeriods };
  let weeks = 0;
  for (const term of terms) {
    const termStart = new Date(`${term.start}T00:00:00`);
    const termEnd = new Date(`${term.end}T00:00:00`);
    const effective = date > termStart ? date : termStart;
    if (effective <= termEnd) weeks += Math.ceil((Math.round((termEnd - effective) / 86400000) + 1) / 7);
  }
  const firstStart = new Date(`${terms[0].start}T00:00:00`);
  const effectiveStart = date > firstStart ? date : firstStart;
  const lastEnd = new Date(`${terms.at(-1).end}T00:00:00`);
  const spanDays = Math.round((lastEnd - effectiveStart) / 86400000) + 1;
  return {
    weeks,
    factor: totalSchoolWeeks > 0 ? weeks / totalSchoolWeeks : 1,
    terms: Math.max(1, terms.filter((term) => date <= new Date(`${term.end}T00:00:00`)).length),
    spanWeeks: Math.max(1, Math.ceil(spanDays / 7)),
    months: Math.max(1, (lastEnd.getFullYear() - effectiveStart.getFullYear()) * 12 + (lastEnd.getMonth() - effectiveStart.getMonth()) + 1),
  };
};
let startDate = parseStartDate(startDateParam);
const validStartDate = Boolean(startDate);
const invalidStartDateNote = startDateParam && !validStartDate
  ? 'The start date in the URL could not be read. Expected a date like startDate=2027-07-01.'
  : '';
let currentStartDateValue = validStartDate ? startDateParam : null;
let {
  weeks: weeksRemaining, factor: scaleFactor, terms: termsRemaining,
  spanWeeks: weeksForPeriods, months: monthsRemaining,
} = computeScaling(startDate);
const scale = (amount) => Math.round(amount * scaleFactor * 100) / 100;

const schoolChildCount = () => Number(document.querySelector('#pledge-form [name="schoolChildCount"]')?.value || 0);
const kindergartenChildCount = () => Number(document.querySelector('#pledge-form [name="kindergartenChildCount"]')?.value || 0);

function childCount() {
  return schoolChildCount() + kindergartenChildCount();
}

const t = (template, vars = {}) => interpolate(template, {
  year: pledgeRules.year,
  schoolName: pledgeRules.schoolName,
  child: childWord(childCount()),
  theirFace: theirFacePhrase(childCount()),
  trustAdminContact: trustAdministrator,
  schoolChild: childWord(schoolChildCount()),
  kindergartenChild: childWord(kindergartenChildCount()),
  ...vars,
});

const applyLinks = (html, links) => Object.entries(links).reduce(
  (h, [phrase, url]) => h.replace(phrase, `<a href="${url}" target="_blank" rel="noopener">${phrase}</a>`),
  html,
);

function refreshTemplates() {
  document.querySelectorAll('[data-template]').forEach((element) => {
    const template = decodeURIComponent(element.dataset.template);
    const links = element.dataset.links ? JSON.parse(decodeURIComponent(element.dataset.links)) : {};
    element.innerHTML = applyLinks(t(template), links);
  });
}

function applyStartDate(value) {
  const date = parseStartDate(value);
  startDate = date;
  currentStartDateValue = date ? value : null;
  ({
    weeks: weeksRemaining, factor: scaleFactor, terms: termsRemaining,
    spanWeeks: weeksForPeriods, months: monthsRemaining,
  } = computeScaling(date));
  const note = document.querySelector('#start-date-note');
  if (note) {
    const input = note.querySelector('#start-date-input');
    if (input) input.value = value || '';
    const summary = note.querySelector('#start-date-summary');
    if (summary) {
      summary.textContent = date
        ? t(labels.startDateSummary, { weeks: weeksRemaining, totalWeeks: totalSchoolWeeks })
        : labels.noStartDateNote;
    }
  }
  dynamicContributionRows();
}

function field(label, name, type = 'text', options = {}) {
  const control = type === 'textarea'
    ? `<textarea name="${name}" rows="2" ${options.required ? 'required' : ''}></textarea>`
    : type === 'select'
      ? `<select name="${name}" ${options.required ? 'required' : ''}>${(options.options || []).map((opt) => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>`).join('')}</select>`
      : `<input name="${name}" type="${type}" ${type === 'number' ? 'inputmode="numeric" pattern="[0-9]*"' : ''} ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} />`;
  const tooltip = options.tooltip
    ? ` <span class="tooltip" tabindex="0" role="note" aria-label="${t(options.tooltip)}">i<span class="tooltip-text" role="tooltip">${t(options.tooltip)}</span></span>`
    : '';
  return `<label><span class="field-label">${t(label)}${options.required ? ' <span aria-hidden="true">*</span>' : ''}${tooltip}</span>${control}</label>`;
}

function sectionHead(number) {
  const section = sections.find((s) => s.number === number);
  return `<div class="section-heading"><h2>${sectionTitle(section, pledgeRules.year)}</h2></div>`;
}

function expandable(title, body, options = {}) {
  const id = options.id ? ` id="${options.id}"` : '';
  const open = options.open ? ' open' : '';
  const template = encodeURIComponent(body);
  return `<details class="info-panel"${id}${open}><summary>${t(title)}</summary><div class="info-panel-body" data-template="${template}">${t(body)}</div></details>`;
}

function checklist(key, required = false, links = {}) {
  const linksAttr = Object.keys(links).length ? ` data-links="${encodeURIComponent(JSON.stringify(links))}"` : '';
  return `<fieldset>${consentGroups[key].map((text, index) => {
    const html = applyLinks(t(text), links);
    return `<label class="check"><input type="checkbox" name="${key}-${index}" ${required ? 'required' : ''} /> <span${linksAttr} data-template="${encodeURIComponent(text)}">${html}</span></label>`;
  }).join('')}</fieldset>`;
}

function dynamicChildren() {
  const existing = Object.fromEntries(new FormData(document.querySelector('#pledge-form')).entries());
  const schoolCount = Number(document.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(document.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  const rows = (kind, count) => Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const title = t(kind === 'school' ? labels.schoolChild : labels.kindergartenChild, { n });
    const classOptions = [{ value: '', label: '' }, ...Array.from({ length: 7 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))];
    const ageOptions = [{ value: '', label: '' }, ...Array.from({ length: 5 }, (_, i) => ({ value: i + 2, label: String(i + 2) }))];
    const daysOptions = [
      { value: '', label: '' },
      { value: 5, label: '5 days' },
      { value: 3, label: '3 days' },
      { value: 2, label: '2 days' },
    ];
    const details = kind === 'school'
      ? field(t(labels.childClass), `${kind}${n}Class`, 'select', { required: true, options: classOptions })
      : `${field(t(labels.childAge, { termStart: firstTermStartLabel }), `${kind}${n}Age`, 'select', { required: true, options: ageOptions })}${field(labels.daysPerWeek, `${kind}${n}Days`, 'select', { required: true, options: daysOptions })}`;
    return `<div class="child-row"><strong>${title}</strong>${field(labels.childName, `${kind}${n}Name`, 'text', { required: true })}${details}</div>`;
  }).join('');
  document.querySelector('#school-children').innerHTML = rows('school', schoolCount) || `<p class="muted">${labels.noSchoolChildren}</p>`;
  document.querySelector('#kindergarten-children').innerHTML = rows('kindergarten', kindergartenCount) || `<p class="muted">${labels.noKindergartenChildren}</p>`;
  Object.entries(existing).forEach(([name, value]) => {
    document.querySelectorAll(`#pledge-form [name="${name}"]`).forEach((input) => {
      if (input.type === 'radio') input.checked = input.value === value;
      else if (input.type === 'checkbox') input.checked = value === 'on';
      else input.value = value;
    });
  });
  dynamicContributionRows();
  dynamicMedicalInfoRows();
  refreshTemplates();
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
    const recommended = scale(kind === 'school'
      ? pledgeRules.school.recommendedByChild[index] || pledgeRules.school.recommendedByChild.at(-1)
      : pledgeRules.kindergarten.recommendedByDays[days]);
    const amountName = `${kind}${number}Amount`;
    const selected = userEditedAmounts.has(amountName) ? currentAmount : recommended;
    const childName = form.querySelector(`[name="${sourceName}"]`)?.value.trim() || `${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${number}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${sourceName}">${escapeHtml(childName)}</span><span class="recommended">Recommended: ${money(recommended)}</span><input name="${kind}${number}Amount" type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${escapeHtml(selected)}" aria-label="Agreed amount for ${kind} child ${number}" required /></div>`;
  }).join('');
  document.querySelector('#pledge-rows').innerHTML = `${rows('school', schoolCount)}${rows('kindergarten', kindergartenCount)}` || '<p class="muted">Add students above to see pledge amounts.</p>';
  document.querySelector('#disbursement-rows').innerHTML = Array.from({ length: schoolCount + kindergartenCount }, (_, index) => {
    const source = index < schoolCount ? `school${index + 1}Name` : `kindergarten${index - schoolCount + 1}Name`;
    const fieldName = source.replace('Name', 'Disbursement');
    const recommended = scale(pledgeRules.disbursementPerChild);
    const current = userEditedAmounts.has(fieldName) ? form.querySelector(`[name="${fieldName}"]`)?.value : recommended;
    const childName = form.querySelector(`[name="${source}"]`)?.value.trim() || `Child ${index + 1}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${source}">${escapeHtml(childName)}</span><span class="recommended">Recommended: ${money(recommended)}</span><input name="${fieldName}" type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${escapeHtml(current)}" aria-label="Disbursement for child ${index + 1}" required /></div>`;
  }).join('') || '<p class="muted">Add students above to see disbursement amounts.</p>';
  syncLinkedNames();
}

function dynamicMedicalInfoRows() {
  const form = document.querySelector('#pledge-form');
  const rows = (kind, count) => Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const sourceName = `${kind}${number}Name`;
    const fieldName = `${kind}${number}MedicalInfo`;
    const current = form.querySelector(`[name="${fieldName}"]`)?.value || '';
    return `<div class="medical-info-row"><strong class="linked-name" data-source="${sourceName}">${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${number}</strong><textarea name="${fieldName}" rows="2" placeholder="${t(labels.medicalInfoPlaceholder)}">${escapeHtml(current)}</textarea></div>`;
  }).join('');
  const container = document.querySelector('#medical-info-rows');
  if (!container) return;
  const schoolCount = Number(form.querySelector('[name="schoolChildCount"]')?.value || 0);
  const kindergartenCount = Number(form.querySelector('[name="kindergartenChildCount"]')?.value || 0);
  container.innerHTML = `${rows('school', schoolCount)}${rows('kindergarten', kindergartenCount)}` || `<p class="muted">${labels.noSchoolChildren}</p>`;
  syncLinkedNames();
}

function syncLinkedNames() {
  document.querySelectorAll('[data-source]').forEach((element) => {
    const source = document.querySelector(`[name="${element.dataset.source}"]`);
    element.textContent = source?.value.trim() || 'Unnamed child';
  });
  updateEotcConsentLabels();
}

function updateEotcConsentLabels() {
  const form = document.querySelector('#pledge-form');
  const count = (kind) => Number(form.querySelector(`[name="${kind}ChildCount"]`)?.value || 0);
  const namesFor = (kind) => Array.from({ length: count(kind) }, (_, index) => {
    const name = form.querySelector(`[name="${kind}${index + 1}Name"]`)?.value.trim();
    return name || `${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${index + 1}`;
  });
  const list = (items) => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] || '');
  ['school', 'kindergarten'].forEach((kind) => {
    const fieldset = document.querySelector(`#eotc-${kind}-consent`);
    if (!fieldset) return;
    const names = namesFor(kind);
    const namesSpan = fieldset.querySelector('.consent-names');
    const checkboxes = fieldset.querySelectorAll('input[type="checkbox"]');
    if (!names.length) {
      fieldset.hidden = true;
      checkboxes.forEach((checkbox) => {
        checkbox.required = false;
        checkbox.disabled = true;
      });
      return;
    }
    fieldset.hidden = false;
    checkboxes.forEach((checkbox) => {
      checkbox.required = false;
      checkbox.disabled = false;
    });
    if (namesSpan) namesSpan.textContent = list(names);
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
      const label = document.querySelector(`[name="${name}"]`)?.value.trim() || t(kind === 'school' ? labels.schoolChild : labels.kindergartenChild, { n: number });
      const checkboxName = `custody-${index}-${kind}${number}`;
      return `<label class="check"><input type="checkbox" name="${checkboxName}" ${existing[checkboxName] ? 'checked' : ''} /> <span data-source="${name}">${escapeHtml(label)}</span></label>`;
    }).join('') || '<p class="muted">Add children in section 01 first.</p>';
    return `<div class="custody-arrangement">
      <h4>${t(labels.custodyArrangement, { n: index + 1 })}</h4>
      <fieldset><legend>${labels.custodyChildrenAffected}</legend>${childrenCheckboxes}</fieldset>
      ${field(labels.custodyLivingArrangements, `custody-${index}-livingArrangements`, 'textarea', { required: true })}
      ${field(labels.custodyLegalRestrictions, `custody-${index}-legalRestrictions`, 'textarea', { required: true })}
      ${field(labels.custodyFinancialArrangements, `custody-${index}-financialArrangements`, 'textarea', { required: true, tooltip: labels.custodyFinancialTooltip })}
      ${field(labels.custodyExplanation, `custody-${index}-explanation`, 'textarea')}
      ${index > 0 ? `<button type="button" class="remove-custody-arrangement" data-index="${index}">${labels.custodyRemove}</button>` : ''}
    </div>`;
  }).join('');
  Object.entries(existing).forEach(([name, value]) => {
    if (!name.startsWith('custody-')) return;
    const input = document.querySelector(`[name="${name}"]`);
    if (input && input.type !== 'checkbox' && input.type !== 'radio') input.value = value;
    if (input && (input.type === 'checkbox' || input.type === 'radio')) input.checked = Boolean(value);
  });
}

function updateSeparateFamilySection() {
  const selected = document.querySelector('[name="familyType"]:checked')?.value;
  const other = document.querySelector('[name="otherParentName"]');
  const together = selected === 'together';
  const split = selected === 'split';
  if (other) {
    const wrapper = other.closest('label');
    if (wrapper) wrapper.hidden = !together;
    other.disabled = !together;
    other.required = together;
    if (!together) other.value = '';
  }
  const otherSignature = document.querySelector('[name="otherParentSignature"]');
  if (otherSignature) {
    const wrapper = document.querySelector('#other-parent-signature');
    if (wrapper) wrapper.hidden = !together;
    otherSignature.disabled = !together;
    otherSignature.required = together;
    if (!together) otherSignature.value = '';
  }
  const paymentNote = document.querySelector('#split-payment-note');
  if (paymentNote) paymentNote.hidden = !split;
}

function adminPanelHTML() {
  return `
    <section class="card admin-panel" aria-label="Admin tools">
      <h2>Admin Panel</h2>
      <div class="admin-tool">
        <h3>Mid-year start link</h3>
        <p class="muted">Generate a link for families joining partway through the year. Recommended amounts are pro-rated to the weeks remaining from this date.</p>
        <div class="admin-row">
          <input type="date" id="admin-start-date" value="${escapeHtml(startDateParam || '')}" aria-label="Start date" />
          <button type="button" id="admin-generate-link">Generate link</button>
        </div>
        <div class="admin-row">
          <input type="text" id="admin-link-output" readonly placeholder="Generated link will appear here" aria-label="Generated link" />
          <button type="button" id="admin-copy-link">Copy link</button>
        </div>
      </div>
      <div class="admin-tool">
        <h3>Load pledge data</h3>
        <p class="muted">Load a saved submission JSON file to repopulate the form for reprinting or processing. Accepts either a submission payload or a flat form object.</p>
        <input type="file" id="admin-json-file" accept="application/json,.json" aria-label="Load pledge data JSON file" />
        <p class="admin-output" id="admin-load-output" role="status" aria-live="polite"></p>
      </div>
      <div class="admin-tool">
        <h3>Load test data</h3>
        <p class="muted">Fill the form with the committed sample answers (same as the <code>?dev=1</code> query string) to test the submission pipeline.</p>
        <div class="admin-row">
          <button type="button" id="admin-load-test-data">Load test data</button>
        </div>
      </div>
      <div class="admin-tool">
        <h3>Blank hand-fill form</h3>
        <p class="muted">Print a blank form with 3 school children and 2 Kindergarten / Nursery children, ready to be completed by hand. This clears the answers currently in the form.</p>
        <div class="admin-row">
          <button type="button" id="admin-print-blank">Print blank form (3 school, 2 kindergarten)</button>
        </div>
      </div>
    </section>`;
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <h1>Special Character Pledge Form <em>${pledgeRules.year}</em></h1>
        <p class="intro">This is a digital version of the Special Character Pledge Form, replacing previous years paper copy.</p>
        ${pledgeRules.returnBy && !validStartDate ? `<p class="return-by">${t(labels.returnByTop, { date: formatLongDateOrdinal(pledgeRules.returnBy) })}</p>` : ''}
        ${isDraft ? '<p class="draft-warning"><strong>Draft form:</strong> This form is currently in development and not yet live. Do not submit real pledges until this notice is removed.</p>' : ''}
        <div class="status" role="status" aria-live="polite"><span class="status-dot"></span><span id="save-status">Ready to begin</span></div>
        ${isDev ? '<button type="button" id="dev-fill" class="dev-fill">Load test data</button>' : ''}
      </header>

      <div id="submit-success" hidden tabindex="-1">${successHTML}<div class="success-actions"><button type="button" class="print-button" data-print>Print this form (keep for your own records)</button></div></div>
      ${isAdmin ? adminPanelHTML() : ''}
      <form id="pledge-form">
        <section class="card accent-card">
          ${sectionHead('01')}
          <div class="grid two">${field(labels.parentName, 'parentName', 'text', { required: true })}          ${field(labels.email, 'email', 'email', { required: true, tooltip: labels.emailTooltip })}</div>
          <fieldset class="family-type"><legend>${labels.familyTypeLegend}</legend>
            <label class="check"><input type="radio" name="familyType" value="together" required /> <span>${labels.familyTogether}</span></label>
            <label class="check"><input type="radio" name="familyType" value="split" required /> <span>${labels.familySplit}</span></label>
          </fieldset>
          ${field(labels.otherParentName, 'otherParentName', 'text', { required: true })}
          <h3>${labels.childrenQuestion}</h3><div class="grid two"><label>${labels.schoolChildren}<select name="schoolChildCount" required>${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label><label>${labels.kindergartenChildren}<select name="kindergartenChildCount" required>${Array.from({ length: pledgeRules.maxChildrenPerGroup + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select></label></div>
          <h3>${labels.schoolChildren}</h3><div id="school-children"></div><h3>${labels.kindergartenChildren}</h3><div id="kindergarten-children"></div>
        </section>

        <section class="card">${sectionHead('02')}
          <p class="muted" data-template="${encodeURIComponent(labels.commitmentIntro)}">${t(labels.commitmentIntro)}</p>
          ${checklist('commitment', true)}
        </section>

        <section class="card">${sectionHead('03')}
          <p class="muted" data-template="${encodeURIComponent(labels.conductIntro)}">${t(labels.conductIntro)}</p>
          ${checklist('conduct', true, { 'the school website': 'https://www.tera.school.nz/policies' })}
        </section>

        <section class="card">${sectionHead('04')}
          <p class="muted">${labels.medicalIntro}</p>
          ${checklist('medical')}
        </section>

        <section class="card">${sectionHead('05')}
          <p class="muted" data-template="${encodeURIComponent(labels.medicalInfoIntro)}">${t(labels.medicalInfoIntro)}</p>
          <div id="medical-info-rows"></div>
          <p class="fine-print eotc-note" data-template="${encodeURIComponent(labels.medicalInfoOutro)}">${t(labels.medicalInfoOutro)}</p>
        </section>

        <section class="card">${sectionHead('06')}
          <p class="muted" data-template="${encodeURIComponent(labels.emergencyIntro)}">${t(labels.emergencyIntro)}</p>
          <div class="emergency-contact"><h3>${t(labels.emergencyContact, { n: 1 })}</h3><div class="grid three">${field(labels.emergencyName, 'emergencyContact1Name', 'text', { required: true })}${field(labels.emergencyPhone, 'emergencyContact1Phone', 'tel', { required: true })}${field(labels.emergencyRelationship, 'emergencyContact1Relationship', 'text', { required: true })}</div></div>
          <div class="emergency-contact"><h3>${t(labels.emergencyContact, { n: 2 })}</h3><div class="grid three">${field(labels.emergencyName, 'emergencyContact2Name', 'text', { required: true })}${field(labels.emergencyPhone, 'emergencyContact2Phone', 'tel', { required: true })}${field(labels.emergencyRelationship, 'emergencyContact2Relationship', 'text', { required: true })}</div></div>
          <div class="emergency-comments">${field(labels.emergencyComments, 'emergencyComments', 'textarea')}</div>
          <p class="fine-print eotc-note" data-template="${encodeURIComponent(labels.emergencyOutro)}">${t(labels.emergencyOutro)}</p>
        </section>

        <section class="card">${sectionHead('07')}
          <p class="muted" data-template="${encodeURIComponent(labels.eotcIntro)}">${t(labels.eotcIntro)}</p>
          <p class="fine-print eotc-note" data-template="${encodeURIComponent(labels.eotcWalksIntro)}">${t(labels.eotcWalksIntro)}</p>
          <ul class="eotc-walks-list">${labels.eotcWalks.map((item) => `<li data-template="${encodeURIComponent(item)}">${t(item)}</li>`).join('')}</ul>
          <fieldset id="eotc-school-consent" hidden><legend>${t(eotcLegends.school)} <span class="consent-names"></span></legend>
            ${eotcStatementsSchool.map((text, index) => `<label class="check"><input type="checkbox" name="eotcSchool-${index}" /> <span data-template="${encodeURIComponent(text)}">${t(text)}</span></label>`).join('')}
          </fieldset>
          <fieldset id="eotc-kindergarten-consent" hidden><legend>${t(eotcLegends.kindergarten)} <span class="consent-names"></span></legend>
            ${eotcStatementsKindergarten.map((text, index) => `<label class="check"><input type="checkbox" name="eotcKindergarten-${index}" /> <span data-template="${encodeURIComponent(text)}">${t(text)}</span></label>`).join('')}
          </fieldset>
          <p class="fine-print eotc-note" data-template="${encodeURIComponent(labels.eotcEndNote)}">${t(labels.eotcEndNote)}</p>
        </section>

        <section class="card">${sectionHead('08')}
          <p class="muted" data-template="${encodeURIComponent(labels.photosIntro)}">${t(labels.photosIntro)}</p>
          ${checklist('photos')}
          <p class="muted" data-template="${encodeURIComponent(labels.photosWithdrawNote)}">${t(labels.photosWithdrawNote)}</p>
        </section>

        <section class="card">${sectionHead('09')}
          <label class="check custody-toggle"><input type="checkbox" name="custodyApplies" /> <span>${labels.custodyToggle}</span></label>
          <div id="custody-details" hidden>
            <input type="hidden" name="custodyArrangementCount" value="0" />
            <div id="custody-arrangements"></div>
            <button type="button" id="add-custody-arrangement">${labels.custodyAddAnother}</button>
          </div>
        </section>

        <section class="card">${sectionHead('10')}
          <p class="callout" id="split-payment-note" hidden>${labels.splitPaymentNote}</p>
          <p class="muted">The contributions are donation-based. Recommended amounts are a guideline, not fees. Please contact ${trustAdministrator} if you need to discuss financial hardship.<br><br>As these are donations you may be able to claim back up to 33% of the amount as a donation tax credit from IRD.</p>
          <p class="muted" data-template="${encodeURIComponent(labels.pledgeOtherCostsNote)}">${t(labels.pledgeOtherCostsNote)}</p>
          ${validStartDate ? `<p class="start-date-note" id="start-date-note"><label class="start-date-field">These recommended amounts are based on a start date of <input type="date" id="start-date-input" value="${escapeHtml(startDateParam)}" /></label><span id="start-date-summary">${t(labels.startDateSummary, { weeks: weeksRemaining, totalWeeks: totalSchoolWeeks })}</span></p>` : invalidStartDateNote ? `<p class="start-date-warning">${escapeHtml(invalidStartDateNote)}</p>` : ''}
          <h3 class="amounts-heading">${labels.pledgeAmounts}</h3>
          <p class="muted" data-template="${encodeURIComponent(labels.pledgeIntro)}">${t(labels.pledgeIntro)}</p>
          ${expandable(labels.pledgeInfoTitle, labels.pledgeInfoBody)}
          <p class="rule-note"><strong>${t(labels.recommendedAmountsTitle)}</strong><br />School: ${pledgeRules.school.note}<br/><br>Kindergarten: ${pledgeRules.kindergarten.note}</p>
          <div class="amount-table"><div class="amount-head"><span>${labels.student}</span><span>${labels.recommended}</span><span>${labels.agreedAmount}</span></div><div id="pledge-rows"></div></div>${field(labels.supplementaryDonation, 'supplementaryDonation', 'number', { min: 0 })}<h3 class="amounts-heading">${labels.disbursementAmounts}</h3>
          <p class="muted" data-template="${encodeURIComponent(labels.disbursementIntro)}">${t(labels.disbursementIntro)}</p>
          ${expandable(labels.disbursementInfoTitle, labels.disbursementInfoBody)}
          <div class="amount-table"><div class="amount-head"><span>${labels.student}</span><span>${labels.recommended}</span><span>${labels.agreedAmount}</span></div><div id="disbursement-rows"></div></div>
           <h3 class="amounts-heading">${t(labels.paymentHeading)}</h3>
           <input type="hidden" name="totalPledge" /><div class="price-summary total-summary" aria-live="polite"><div class="total-summary-title">${t(labels.totalPledgeHeading)}</div><div><span>${t(labels.perYear)}</span><strong id="year-total">$0.00</strong></div><div><span>${t(labels.perTerm)}</span><strong id="term-total">$0.00</strong><small id="term-total-note">Total divided by ${pledgeRules.termsPerYear} terms</small></div><div><span>${t(labels.perWeek)}</span><strong id="week-total">$0.00</strong><small id="week-total-note">Total divided by ${pledgeRules.schoolYearWeeks} weeks of the school year</small></div></div>
<fieldset><legend>${labels.paymentPlan}</legend><p class="muted" data-template="${encodeURIComponent(labels.paymentPlanNote)}">${t(labels.paymentPlanNote)}</p>${paymentPlanOptions.map((option) => `<label class="check"><input type="radio" name="paymentPlan" value="${option.label}" required /> <span>${option.label} <em class="plan-price" data-plan="${option.key}"></em></span></label>`).join('')}</fieldset>
           ${field(labels.pledgeComments, 'pledgeComments', 'textarea')}
           <p class="muted" data-template="${encodeURIComponent(labels.kindoPaymentsNote)}">${t(labels.kindoPaymentsNote)}</p>
           ${expandable(labels.kindoInfoTitle, labels.kindoInfoBody, { id: 'kindo-info' })}
        </section>

        <section class="card sign-card">${sectionHead('11')}
          <p>I confirm that the information above is correct and that I will advise the school of changes.</p>
          ${field(labels.anythingElse, 'anythingElseComments', 'textarea')}
          <label class="honeypot" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
          <div class="grid two">${field(labels.signature, 'signature', 'text', { required: true })}<div id="other-parent-signature" hidden>${field(labels.otherParentSignature, 'otherParentSignature', 'text', { required: true })}</div>${field(labels.signatureDate, 'signatureDate', 'date', { required: true })}</div>
          ${expandable(labels.privacyStatementTitle, privacyStatementHtml, { id: 'privacy-statement' })}
          <p class="muted">${t(labels.privacyNotice)}</p>
          ${submitUrl ? '' : `<div class="submit-error" role="alert"><h3>This form is not connected</h3><p>The submission service has not been configured, so this form can’t be submitted from this page. Please print this form and email it to the school office${contactEmail ? ` at <a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}.</p></div>`}
          <div id="submit-error" class="submit-error" hidden role="alert">
            <h3>We couldn’t submit your pledge</h3>
            <p id="submit-error-cause"></p>
            <p>Your answers are still on this page. Please try again, and if it still doesn’t work, print this form and email it to the school office${contactEmail ? ` at <a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}.</p>
            <p class="fine-print" id="submit-error-detail"></p>
          </div>
          <button class="submit" type="submit"${submitUrl ? '' : ' disabled'}>Submit pledge <span>↗</span></button>
          <button type="button" class="print-button" data-print>Print this form</button>
          <p class="fine-print">Submissions are sent securely to the school’s configured service.</p>
        </section>
      </form>
      <footer>${pledgeRules.returnBy && !validStartDate ? `<p class="return-by reminder">${t(labels.returnByBottom, { date: formatLongDateOrdinal(pledgeRules.returnBy) })}</p>` : ''}${contactEmail ? `Questions?&nbsp;&nbsp;&nbsp;Contact <a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}<p><a href="#privacy-statement">Privacy statement</a></p></footer>
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
  const data = {};
  document.querySelectorAll('#pledge-form [name]').forEach((input) => {
    if (input.disabled) {
      data[input.name] = input.type === 'checkbox' ? 'off' : '';
    } else if (input.type === 'checkbox') {
      data[input.name] = input.checked ? 'on' : 'off';
    } else if (input.type === 'radio') {
      if (input.checked) data[input.name] = input.value;
      else if (data[input.name] === undefined) data[input.name] = 'off';
    } else {
      data[input.name] = input.value;
    }
  });
  return data;
}

function submissionPayload() {
  return {
    form: formData(),
    submittedAt: new Date().toISOString(),
    timeOnPageMs: Date.now() - FORM_LOAD_TIME,
    formVersion,
    dev: isDev || params.has('dev'),
    ...(currentStartDateValue ? { startDate: currentStartDateValue } : {}),
  };
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData()));
    document.querySelector('#save-status').textContent = 'Draft saved locally';
  } catch {
    document.querySelector('#save-status').textContent = 'Local saving unavailable';
  }
}

function applyFormValues(data) {
  const form = document.querySelector('#pledge-form');
  ['schoolChildCount', 'kindergartenChildCount'].forEach((name) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (input && data[name] !== undefined && data[name] !== '') input.value = data[name];
  });
  dynamicChildren();
  const custodyToggle = form.querySelector('[name="custodyApplies"]');
  if (custodyToggle) custodyToggle.checked = data.custodyApplies === 'on';
  const custodyCountInput = form.querySelector('[name="custodyArrangementCount"]');
  if (custodyCountInput && data.custodyArrangementCount) custodyCountInput.value = data.custodyArrangementCount;
  updateCustodySection();
  Object.entries(data).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = value === 'on';
    else if (input.type === 'radio') {
      form.querySelectorAll(`[name="${name}"]`).forEach((radio) => {
        radio.checked = value !== 'off' && radio.value === value;
      });
    } else {
      input.value = value;
    }
  });
  updateSeparateFamilySection();
  syncLinkedNames();
  calculateTotals();
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    applyFormValues(draft);
    if (Object.keys(draft).length) document.querySelector('#save-status').textContent = 'Draft restored from this device';
  } catch { /* Ignore malformed or unavailable local drafts. */ }
}

function generateStartDateLink() {
  const value = document.querySelector('#admin-start-date')?.value;
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if (value) url.searchParams.set('startDate', value);
  return url.toString();
}

async function loadPledgeJsonFile(file) {
  const parsed = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== 'object') throw new Error('Expected a JSON object');
  const data = parsed.form && typeof parsed.form === 'object' ? parsed.form : parsed;
  if (parsed.startDate) applyStartDate(parsed.startDate);
  applyFormValues(data);
  saveDraft();
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
  document.querySelector('#year-total').textContent = money(annualTotal);
  const termTotal = annualTotal / termsRemaining;
  const weekTotal = annualTotal / weeksForPeriods;
  document.querySelector('#term-total').textContent = money(termTotal);
  document.querySelector('#week-total').textContent = money(weekTotal);
  const remaining = startDate ? ' remaining' : '';
  const termNote = document.querySelector('#term-total-note');
  if (termNote) termNote.textContent = `Total divided by ${termsRemaining} term${termsRemaining === 1 ? '' : 's'}${remaining}`;
  const weekNote = document.querySelector('#week-total-note');
  if (weekNote) weekNote.textContent = `Total divided by ${weeksForPeriods} week${weeksForPeriods === 1 ? '' : 's'} of the school year${remaining}`;
  const periodCounts = {
    week: weeksForPeriods,
    fortnight: Math.ceil(weeksForPeriods / 2),
    month: monthsRemaining,
    term: termsRemaining,
    lump: 1,
  };
  paymentPlanOptions.forEach((option) => {
    const planPrice = document.querySelector(`[data-plan="${option.key}"]`);
    if (planPrice && periodCounts[option.key] !== undefined) planPrice.textContent = `(${money(annualTotal / periodCounts[option.key])})`;
  });
}

let devPayloadConfirmed = false;

function showSubmissionPopup(payload, onSend) {
  document.querySelector('.dev-popup')?.remove();
  const json = JSON.stringify(payload, null, 2);
  const overlay = document.createElement('div');
  overlay.className = 'dev-popup';
  overlay.innerHTML = `
    <div class="dev-popup-box" role="dialog" aria-modal="true" aria-label="Submission JSON preview">
      <header><h2>Submission JSON</h2><button type="button" class="dev-popup-close" aria-label="Close">&times;</button></header>
      <pre class="dev-popup-json"></pre>
      <footer>
        <button type="button" class="dev-popup-copy">Copy JSON</button>
        <button type="button" class="dev-popup-send">Send anyway</button>
        <button type="button" class="dev-popup-close-btn">Close</button>
      </footer>
    </div>`;
  overlay.querySelector('.dev-popup-json').textContent = json;
  const close = () => overlay.remove();
  overlay.querySelector('.dev-popup-close').addEventListener('click', close);
  overlay.querySelector('.dev-popup-close-btn').addEventListener('click', close);
  overlay.querySelector('.dev-popup-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(json);
      overlay.querySelector('.dev-popup-copy').textContent = 'Copied';
    } catch { /* Clipboard unavailable. */ }
  });
  overlay.querySelector('.dev-popup-send').addEventListener('click', () => {
    overlay.remove();
    onSend();
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); }, { once: true });
  document.body.appendChild(overlay);
}

function formatErrorTime() {
  return new Date().toLocaleString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function describeSubmitError(error) {
  const message = String(error?.message || error || 'Unknown error');
  if (/too long to submit/i.test(message)) {
    return {
      cause: 'This form is too long to send (over 2 MB). Please shorten the longer answers, or print the form and email it to the school office.',
      detail: 'The submission was not sent because it exceeded the 2 MB limit.',
    };
  }
  if (error?.name === 'AbortError') {
    return {
      cause: 'The request timed out before the school’s server responded, so nothing was sent.',
      detail: `No response received. Technical detail: ${message}.`,
    };
  }
  const status = Number(error?.status) || Number(message.match(/Submission failed \((\d{3})\)/)?.[1]);
  if (Number.isFinite(status)) {
    const details = Array.isArray(error?.serverDetails) ? error.serverDetails.filter(Boolean) : [];
    if (status === 400 && details.length) {
      return {
        cause: `The school’s server rejected the form: ${details.join('; ')}`,
        detail: `${error?.serverError ? `${error.serverError}. ` : ''}Server response: ${message}.`,
      };
    }
    const byStatus = {
      400: 'The school’s server rejected the form. Something may be missing or invalid.',
      404: 'The school’s submission address could not be found. It may have changed.',
      413: 'The form was too large for the school’s server to accept.',
      429: 'Too many submissions were sent in a short time. Please wait a moment and try again.',
      500: 'The school’s server had an internal error and could not accept the form.',
      502: 'The school’s server could not complete the submission (a service it relies on may be unavailable).',
      503: 'The school’s server is temporarily unavailable.',
      504: 'The school’s server took too long to respond.',
    };
    return {
      cause: byStatus[status] || `The school’s server returned an unexpected response (HTTP ${status}).`,
      detail: `${error?.serverError ? `${error.serverError}. ` : ''}Server response: ${message}.`,
    };
  }
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return {
      cause: 'We couldn’t reach the school’s server. You may be offline, or the connection was interrupted.',
      detail: 'No data was sent. This is usually a temporary connection problem.',
    };
  }
  return {
    cause: 'Something went wrong while sending your form to the school.',
    detail: `Technical detail: ${message}.`,
  };
}

function showSubmitError(error) {
  const { cause, detail } = describeSubmitError(error);
  const causeElement = document.querySelector('#submit-error-cause');
  const detailElement = document.querySelector('#submit-error-detail');
  if (causeElement) causeElement.textContent = cause;
  if (detailElement) detailElement.textContent = `${detail} Attempted at ${formatErrorTime()}.`;
  const panel = document.querySelector('#submit-error');
  if (panel) {
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const status = document.querySelector('#save-status');
  if (status) status.textContent = 'Submission failed — please print and contact the office';
}

function showSuccess(button) {
  submitted = true;
  localStorage.removeItem(STORAGE_KEY);
  const errorPanel = document.querySelector('#submit-error');
  if (errorPanel) errorPanel.hidden = true;
  const success = document.querySelector('#submit-success');
  if (success) {
    success.hidden = false;
    success.scrollIntoView({ block: 'start' });
    try { success.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
  }
  document.querySelectorAll('#pledge-form [data-print]').forEach((element) => { element.hidden = true; });
  const status = document.querySelector('#save-status');
  if (status) status.textContent = 'Submitted successfully';
  if (button) button.remove();
}

function printForm(onRestore) {
  const root = document.querySelector('#app') || document.body;
  const hidden = [];
  const openDetails = [...document.querySelectorAll('details[open]')];
  openDetails.forEach((details) => details.removeAttribute('open'));
  let node = root;
  while (node && node.parentElement && node !== document.body) {
    for (const sibling of node.parentElement.children) {
      if (sibling !== node && !sibling.contains(root)) {
        sibling.classList.add('pledge-print-hidden');
        hidden.push(sibling);
      }
    }
    node = node.parentElement;
  }
  const restore = () => {
    hidden.forEach((element) => element.classList.remove('pledge-print-hidden'));
    openDetails.forEach((details) => details.setAttribute('open', ''));
    if (onRestore) onRestore();
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    restore();
    window.removeEventListener('afterprint', finish);
  };
  window.addEventListener('afterprint', finish);
  window.print();
  setTimeout(finish, 2000);
}

function clearFormValues() {
  document.querySelectorAll('#pledge-form input, #pledge-form select, #pledge-form textarea').forEach((element) => {
    if (element.type === 'checkbox' || element.type === 'radio') element.checked = false;
    else if (element.tagName === 'SELECT') element.selectedIndex = 0;
    else element.value = '';
  });
}

function printBlankForm() {
  const form = document.querySelector('#pledge-form');
  if (!form) return;
  clearFormValues();
  form.querySelector('[name="schoolChildCount"]').value = '3';
  form.querySelector('[name="kindergartenChildCount"]').value = '2';
  dynamicChildren();
  // Blank the class / age / days-per-week dropdowns for hand-filling.
  form.querySelectorAll('#school-children select, #kindergarten-children select').forEach((select) => { select.selectedIndex = -1; });
  // Keep the Recommended column but leave the agreed amounts blank.
  form.querySelectorAll('input[name$="Amount"], input[name$="Disbursement"], [name="supplementaryDonation"]').forEach((element) => { element.value = ''; });
  // The split-parent section only belongs to the digital form.
  const familyType = form.querySelector('.family-type');
  const familyTypeWasHidden = familyType ? familyType.hidden : true;
  [
    familyType,
    form.querySelector('[name="otherParentName"]')?.closest('label'),
    document.querySelector('#other-parent-signature'),
    document.querySelector('#split-payment-note'),
  ].filter(Boolean).forEach((element) => { element.hidden = true; });
  // Show one custodial arrangement for hand-filling, but print the toggle unticked.
  const custodyToggle = form.querySelector('[name="custodyApplies"]');
  const custodyCount = form.querySelector('[name="custodyArrangementCount"]');
  if (custodyToggle) custodyToggle.checked = true;
  if (custodyCount) custodyCount.value = '1';
  updateCustodySection();
  if (custodyToggle) custodyToggle.checked = false;
  ['#year-total', '#term-total', '#week-total'].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = '';
  });
  printForm(() => {
    if (familyType) familyType.hidden = familyTypeWasHidden;
    updateSeparateFamilySection();
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function submissionError(response) {
  let body = null;
  try { body = await response.json(); } catch { /* Response body was not JSON. */ }
  const error = new Error(`Submission failed (${response.status})`);
  error.status = response.status;
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string') error.serverError = body.error;
    if (Array.isArray(body.details)) error.serverDetails = body.details.map(String);
  }
  return error;
}

async function sendPledge(form) {
  const payload = submissionPayload();
  const body = JSON.stringify(payload);
  const honeypotFilled = Boolean(form.querySelector('[name="website"]')?.value.trim());
  const isSpam = honeypotFilled || (!new URLSearchParams(window.location.search).has('dev') && payload.timeOnPageMs < MIN_FILL_TIME_MS);
  const button = form.querySelector('.submit');
  if (isSpam) {
    showSuccess(button);
    return;
  }
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    showSubmitError(new Error('This form is too long to submit (over 2 MB)'));
    return;
  }
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const response = await fetchWithTimeout(submitUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 20000);
    if (!response.ok) throw await submissionError(response);
    showSuccess(button);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Submit pledge ↗';
    showSubmitError(error);
  }
}

function fieldDescription(element) {
  if (!element) return 'the highlighted field';
  const label = element.closest('label');
  const text = label?.querySelector('.field-label')?.textContent?.trim()
    || label?.textContent?.trim().slice(0, 60)
    || element.getAttribute('aria-label')
    || element.getAttribute('name')
    || 'a required field';
  return text.replace(/\s*\*$/, '').replace(/\s+/g, ' ');
}

async function submit(event) {
  event.preventDefault();
  if (submitted || !submitUrl) return;
  try {
    const form = event.currentTarget;
    if (!form) return;
    if (childCount() === 0) {
      const status = document.querySelector('#save-status');
      if (status) {
        status.textContent = 'Please add at least one child (school or kindergarten) before submitting';
        status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      document.querySelector('[name="schoolChildCount"]')?.focus();
      return;
    }
    const emailInput = form.querySelector('[name="email"]');
    if (emailInput) emailInput.setCustomValidity(EMAIL_PATTERN.test(emailInput.value.trim()) ? '' : 'Please enter a valid email address');
    if (!form.reportValidity()) {
      const firstInvalid = form.querySelector('input:invalid, select:invalid, textarea:invalid');
      const status = document.querySelector('#save-status');
      if (firstInvalid) {
        const label = fieldDescription(firstInvalid);
        if (status) status.textContent = firstInvalid.validity.valueMissing ? `Please complete: ${label}` : (firstInvalid.validationMessage || `Please check: ${label}`);
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (status) {
        status.textContent = 'Please complete the highlighted fields before submitting';
      }
      return;
    }
    if (isDev && !devPayloadConfirmed) {
      devPayloadConfirmed = true;
      showSubmissionPopup(submissionPayload(), () => {
        devPayloadConfirmed = false;
        sendPledge(form);
      });
      return;
    }
    devPayloadConfirmed = false;
    await sendPledge(form);
  } catch (error) {
    showSubmitError(error);
  }
}

render();
document.title = `Special Character Pledge Form ${pledgeRules.year}`;
document.querySelector('meta[name="description"]')?.setAttribute('content', `Special Character Pledge Form for ${pledgeRules.schoolName}`);
const form = document.querySelector('#pledge-form');
restoreDraft();
form.addEventListener('input', (event) => {
  if (event.target.name === 'email') event.target.setCustomValidity('');
  if (event.target.name?.endsWith('Amount') || event.target.name?.endsWith('Disbursement')) {
    userEditedAmounts.add(event.target.name);
  }
  syncLinkedNames();
  calculateTotals();
  saveDraft();
});
form.addEventListener('keydown', (event) => {
  if (event.target.type !== 'number') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.length === 1 && !/[0-9]/.test(event.key)) event.preventDefault();
});
form.addEventListener('beforeinput', (event) => {
  if (event.target.type !== 'number') return;
  const inserted = event.data ?? event.dataTransfer?.getData('text') ?? '';
  if (inserted && /\D/.test(inserted)) event.preventDefault();
});
form.addEventListener('paste', (event) => {
  if (event.target.type !== 'number') return;
  event.preventDefault();
  const digits = (event.clipboardData.getData('text') || '').replace(/\D/g, '');
  const input = event.target;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + digits + input.value.slice(end);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
form.addEventListener('change', (event) => {
  if (event.target.id === 'start-date-input') applyStartDate(event.target.value);
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount') dynamicChildren();
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount' || event.target.name === 'custodyApplies') updateCustodySection();
  if (event.target.name === 'familyType') updateSeparateFamilySection();
  if (/^kindergarten\d+Days$/.test(event.target.name)) {
    const amount = scale(pledgeRules.kindergarten.recommendedByDays[event.target.value]);
    const amountInput = form.querySelector(`[name="${event.target.name.replace('Days', 'Amount')}"]`);
    if (amountInput) amountInput.value = amount;
    dynamicContributionRows();
  }
  syncLinkedNames();
  calculateTotals();
  saveDraft();
});
form.addEventListener('submit', submit);
dynamicChildren();
updateSeparateFamilySection();
calculateTotals();

document.querySelector('#add-custody-arrangement')?.addEventListener('click', addCustodyArrangement);
document.querySelector('#dev-fill')?.addEventListener('click', () => {
  loadDevAnswers();
  document.querySelector('#save-status').textContent = 'Test data loaded';
});
document.querySelector('#custody-arrangements')?.addEventListener('click', (event) => {
  if (event.target.classList.contains('remove-custody-arrangement')) {
    removeCustodyArrangement(Number(event.target.dataset.index));
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-print]')) {
    event.preventDefault();
    printForm();
    return;
  }
  if (event.target.closest('a[href="#privacy-statement"]')) {
    event.preventDefault();
    const statement = document.querySelector('#privacy-statement');
    if (statement) {
      statement.setAttribute('open', '');
      statement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});

document.querySelector('#admin-generate-link')?.addEventListener('click', () => {
  document.querySelector('#admin-link-output').value = generateStartDateLink();
});
document.querySelector('#admin-copy-link')?.addEventListener('click', async () => {
  const input = document.querySelector('#admin-link-output');
  const button = document.querySelector('#admin-copy-link');
  if (!input.value) input.value = generateStartDateLink();
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  button.textContent = 'Copied';
});
document.querySelector('#admin-json-file')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  const output = document.querySelector('#admin-load-output');
  if (!file) return;
  try {
    await loadPledgeJsonFile(file);
    output.textContent = `Loaded ${file.name}`;
  } catch (error) {
    output.textContent = `Could not load file: ${error.message}`;
  }
});
document.querySelector('#admin-print-blank')?.addEventListener('click', printBlankForm);
document.querySelector('#admin-load-test-data')?.addEventListener('click', () => {
  loadDevAnswers();
  const status = document.querySelector('#save-status');
  if (status) status.textContent = 'Test data loaded';
});

function loadDevAnswers() {
  const form = document.querySelector('#pledge-form');
  const apply = (name, value) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    if (input.type === 'checkbox') {
      input.checked = value === 'on';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.type === 'radio') {
      const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (input.type === 'number') {
      input.value = value;
    } else {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  Object.entries(examplePledge.form).forEach(([name, value]) => apply(name, value));
  calculateTotals();
  saveDraft();
}

if (new URLSearchParams(window.location.search).has('dev')) {
  loadDevAnswers();
}
