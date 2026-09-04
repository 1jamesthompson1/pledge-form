import './style.css';
import { money, pledgeRules } from './pledge-config.js';
import {
  interpolate, formatLongDate, formatLongDateOrdinal, sections, sectionTitle, consentGroups,
  eotcStatementsSchool, eotcStatementsKindergarten, eotcLegends, labels, childWord,
} from './form-definition.js';
import examplePledge from './example-data.json';

const STORAGE_KEY = `te-ra-pledge-form:${pledgeRules.year}`;

const app = document.querySelector('#app');
const userEditedAmounts = new Set();
const contactEmail = window.PLEDGE_CONFIG?.contactEmail;
const FORM_LOAD_TIME = Date.now();
const MIN_FILL_TIME_MS = 5000;
const isDev = window.PLEDGE_CONFIG?.dev === true;
const successHTML = '<div class="success"><span class="success-mark">✓</span><p class="eyebrow">Pledge received</p><h2>Thank you, your pledge has been submitted.</h2><p>The school will be in touch if anything needs clarification.</p></div>';
const params = new URLSearchParams(window.location.search);
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
  const days = terms.reduce((total, term) => {
    const start = new Date(`${term.start}T00:00:00`);
    const end = new Date(`${term.end}T00:00:00`);
    return total + Math.round((end - start) / 86400000) + 1;
  }, 0);
  return Math.ceil(days / 7);
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
];
const computeScaling = (date) => {
  if (!date) return { weeks: totalSchoolWeeks, factor: 1 };
  let days = 0;
  for (const term of pledgeRules.schoolYear?.terms || []) {
    const termStart = new Date(`${term.start}T00:00:00`);
    const termEnd = new Date(`${term.end}T00:00:00`);
    const effective = date > termStart ? date : termStart;
    if (effective <= termEnd) days += Math.round((termEnd - effective) / 86400000) + 1;
  }
  const weeks = days > 0 ? Math.ceil(days / 7) : 0;
  return { weeks, factor: totalSchoolWeeks > 0 ? weeks / totalSchoolWeeks : 1 };
};
let startDate = parseStartDate(startDateParam);
const validStartDate = Boolean(startDate);
const invalidStartDateNote = startDateParam && !validStartDate
  ? 'The start date in the URL could not be read. Expected a date like startDate=2027-07-01.'
  : '';
let currentStartDateValue = validStartDate ? startDateParam : null;
let { weeks: weeksRemaining, factor: scaleFactor } = computeScaling(startDate);
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

function updateDisbursementNote() {
  const note = document.querySelector('#disbursement-note');
  if (note) note.textContent = `The ${pledgeRules.year} disbursement contribution is ${money(pledgeRules.disbursementPerChild)} per child${startDate ? `, pro-rated to ${money(scale(pledgeRules.disbursementPerChild))} from the start date` : ''}.`;
}

function applyStartDate(value) {
  const date = parseStartDate(value);
  startDate = date;
  currentStartDateValue = date ? value : null;
  ({ weeks: weeksRemaining, factor: scaleFactor } = computeScaling(date));
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
  updateDisbursementNote();
  dynamicContributionRows();
}

function field(label, name, type = 'text', options = {}) {
  const control = type === 'textarea'
    ? `<textarea name="${name}" rows="2" ${options.required ? 'required' : ''}></textarea>`
    : type === 'select'
      ? `<select name="${name}" ${options.required ? 'required' : ''}>${(options.options || []).map((opt) => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>`).join('')}</select>`
      : `<input name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} />`;
  return `<label><span class="field-label">${t(label)}${options.required ? ' <span aria-hidden="true">*</span>' : ''}</span>${control}</label>`;
}

function sectionHead(number) {
  const section = sections.find((s) => s.number === number);
  return `<div class="section-heading"><h2>${sectionTitle(section, pledgeRules.year)}</h2></div>`;
}

function expandable(title, body) {
  return `<details class="info-panel"><summary>${t(title)}</summary><div class="info-panel-body">${t(body)}</div></details>`;
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
    const classOptions = Array.from({ length: 7 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
    const ageOptions = Array.from({ length: 5 }, (_, i) => ({ value: i + 2, label: String(i + 2) }));
    const daysOptions = [
      { value: 5, label: '5 days', selected: true },
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
  updateDisbursementNote();
  Object.entries(existing).forEach(([name, value]) => {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) input.value = value;
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
    return `<div class="amount-row"><span class="linked-name" data-source="${sourceName}">${childName}</span><span class="recommended">Recommended: ${money(recommended)}</span><input name="${kind}${number}Amount" type="number" min="0" step="0.01" value="${selected}" aria-label="Agreed amount for ${kind} child ${number}" required /></div>`;
  }).join('');
  document.querySelector('#pledge-rows').innerHTML = `${rows('school', schoolCount)}${rows('kindergarten', kindergartenCount)}` || '<p class="muted">Add students above to see pledge amounts.</p>';
  document.querySelector('#disbursement-rows').innerHTML = Array.from({ length: schoolCount + kindergartenCount }, (_, index) => {
    const source = index < schoolCount ? `school${index + 1}Name` : `kindergarten${index - schoolCount + 1}Name`;
    const fieldName = source.replace('Name', 'Disbursement');
    const current = form.querySelector(`[name="${fieldName}"]`)?.value || scale(pledgeRules.disbursementPerChild);
    const childName = form.querySelector(`[name="${source}"]`)?.value.trim() || `Child ${index + 1}`;
    return `<div class="amount-row"><span class="linked-name" data-source="${source}">${childName}</span><span class="recommended">Recommended: ${money(scale(pledgeRules.disbursementPerChild))}</span><input name="${fieldName}" type="number" min="0" step="0.01" value="${current}" aria-label="Disbursement for child ${index + 1}" required /></div>`;
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
    return `<div class="medical-info-row"><strong class="linked-name" data-source="${sourceName}">${kind === 'school' ? 'School' : 'Kindergarten / Nursery'} child ${number}</strong><textarea name="${fieldName}" rows="2" placeholder="${t(labels.medicalInfoPlaceholder)}">${current}</textarea></div>`;
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
      checkbox.required = true;
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
      return `<label class="check"><input type="checkbox" name="${checkboxName}" ${existing[checkboxName] ? 'checked' : ''} /> <span data-source="${name}">${label}</span></label>`;
    }).join('') || '<p class="muted">Add children in section 01 first.</p>';
    return `<div class="custody-arrangement">
      <h4>${t(labels.custodyArrangement, { n: index + 1 })}</h4>
      <fieldset><legend>${labels.custodyChildrenAffected}</legend>${childrenCheckboxes}</fieldset>
      ${field(labels.custodyLivingArrangements, `custody-${index}-livingArrangements`, 'textarea', { required: true })}
      ${field(labels.custodyLegalRestrictions, `custody-${index}-legalRestrictions`, 'textarea', { required: true })}
      ${field(labels.custodyFinancialArrangements, `custody-${index}-financialArrangements`, 'textarea', { required: true })}
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

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="hero">
        <h1>Special Character Pledge Form <em>${pledgeRules.year}</em></h1>
        <p class="intro">This is a digital version of the Special Character Pledge Form, replacing previous years paper copy.</p>
        ${pledgeRules.returnBy ? `<p class="return-by">${t(labels.returnByTop, { date: formatLongDateOrdinal(pledgeRules.returnBy) })}</p>` : ''}
        <p class="draft-warning"><strong>Draft form:</strong> This form is currently in development and not yet live. Do not submit real pledges until this notice is removed.</p>
        <div class="status" role="status" aria-live="polite"><span class="status-dot"></span><span id="save-status">Ready to begin</span></div>
        ${isDev ? '<button type="button" id="dev-fill" class="dev-fill">Load test data</button>' : ''}
      </header>
      <form id="pledge-form">
        <section class="card accent-card">
          ${sectionHead('01')}
          <div class="grid two">${field(labels.parentName, 'parentName', 'text', { required: true })}${field(labels.email, 'email', 'email', { required: true })}</div>
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
          ${checklist('medical', true)}
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
          <p class="muted">The contribution is donation-based. Recommended amounts are guidance, not fees. Please contact the Trust Administrator if you need to discuss financial hardship.</p>
          <p class="rule-note">School pricing: ${pledgeRules.school.note}</p>
          <p class="rule-note">Kindergarten pricing: ${pledgeRules.kindergarten.note}</p>
          ${validStartDate ? `<p class="start-date-note" id="start-date-note"><label class="start-date-field">These recommended amounts are based on a start date of <input type="date" id="start-date-input" value="${startDateParam}" /></label><span id="start-date-summary">${t(labels.startDateSummary, { weeks: weeksRemaining, totalWeeks: totalSchoolWeeks })}</span></p>` : invalidStartDateNote ? `<p class="start-date-warning">${invalidStartDateNote}</p>` : ''}<h3 class="amounts-heading">${labels.pledgeAmounts}</h3><div class="amount-table"><div class="amount-head"><span>${labels.student}</span><span>${labels.recommended}</span><span>${labels.agreedAmount}</span></div><div id="pledge-rows"></div></div>${field(labels.supplementaryDonation, 'supplementaryDonation', 'number', { min: 0 })}<h3 class="amounts-heading">${labels.disbursementAmounts}</h3><div class="amount-table"><div class="amount-head"><span>${labels.student}</span><span>${labels.recommended}</span><span>${labels.agreedAmount}</span></div><div id="disbursement-rows"></div></div>${field(labels.disbursementContribution, 'disbursement', 'number', { min: 0, readonly: true })}<p id="disbursement-note" class="muted"></p>
           ${expandable(labels.disbursementInfoTitle, labels.disbursementInfoBody)}
           <div class="total-line">${field(t(labels.totalPledge), 'totalPledge', 'number', { required: true, min: 0, readonly: true })}</div><div class="price-summary" aria-live="polite"><div><span>${labels.perTerm}</span><strong id="term-total">$0.00</strong><small>Total divided by ${pledgeRules.termsPerYear} terms</small></div><div><span>${labels.perWeek}</span><strong id="week-total">$0.00</strong><small>Total divided by ${pledgeRules.schoolYearWeeks} weeks of the school year</small></div></div>
           <fieldset><legend>${labels.paymentPlan}</legend>${paymentPlanOptions.map((option) => `<label class="check"><input type="radio" name="paymentPlan" value="${option.label}" required /> <span>${option.label} <em class="plan-price" data-plan="${option.key}"></em></span></label>`).join('')}</fieldset>
           ${field(labels.pledgeComments, 'pledgeComments', 'textarea')}
        </section>

        <section class="card sign-card">${sectionHead('11')}
          <p>I confirm that the information above is correct and that I will advise the school of changes.</p>
          ${field(labels.anythingElse, 'anythingElseComments', 'textarea')}
          <label class="honeypot" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
          <div class="grid two">${field(labels.signature, 'signature', 'text', { required: true })}${field(labels.signatureDate, 'signatureDate', 'date', { required: true })}</div>
          <button class="submit" type="submit">Submit pledge <span>↗</span></button>
          <p class="fine-print">Submissions are sent securely to the school’s configured service.</p>
        </section>
      </form>
      <footer>${pledgeRules.returnBy ? `<p class="return-by reminder">${t(labels.returnByBottom, { date: formatLongDateOrdinal(pledgeRules.returnBy) })}</p>` : ''}${contactEmail ? `Questions?&nbsp;&nbsp;&nbsp;Contact <a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}</footer>
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
      data[input.name] = input.checked ? input.value : 'off';
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

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    ['schoolChildCount', 'kindergartenChildCount'].forEach((name) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (input && draft[name]) input.value = draft[name];
    });
    dynamicChildren();
    const custodyToggle = document.querySelector('[name="custodyApplies"]');
    if (custodyToggle) custodyToggle.checked = draft.custodyApplies === 'on';
    const custodyCountInput = document.querySelector('[name="custodyArrangementCount"]');
    if (custodyCountInput && draft.custodyArrangementCount) custodyCountInput.value = draft.custodyArrangementCount;
    updateCustodySection();
    Object.entries(draft).forEach(([name, value]) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = value === 'on';
      else if (input.type === 'radio') {
        document.querySelectorAll(`[name="${name}"]`).forEach((radio) => {
          radio.checked = value !== 'off' && radio.value === value;
        });
      } else {
        input.value = value;
      }
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
  const weekTotal = annualTotal / pledgeRules.schoolYearWeeks;
  document.querySelector('#term-total').textContent = money(termTotal);
  document.querySelector('#week-total').textContent = money(weekTotal);
  const periodCounts = {
    week: pledgeRules.schoolYearWeeks,
    fortnight: Math.ceil(pledgeRules.schoolYearWeeks / 2),
    month: schoolYearMonths,
    term: pledgeRules.termsPerYear,
    lump: 1,
  };
  paymentPlanOptions.forEach((option) => {
    const planPrice = document.querySelector(`[data-plan="${option.key}"]`);
    if (planPrice) planPrice.textContent = `(${money(annualTotal / periodCounts[option.key])})`;
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

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  if (isDev && !devPayloadConfirmed) {
    devPayloadConfirmed = true;
    showSubmissionPopup(submissionPayload(), () => {
      devPayloadConfirmed = false;
      submit(event);
    });
    return;
  }
  devPayloadConfirmed = false;
  const payload = submissionPayload();
  const honeypotFilled = Boolean(form.querySelector('[name="website"]')?.value.trim());
  const isSpam = honeypotFilled || (!new URLSearchParams(window.location.search).has('dev') && payload.timeOnPageMs < MIN_FILL_TIME_MS);
  const endpoint = new URLSearchParams(window.location.search).get('endpoint') || window.PLEDGE_CONFIG?.submitUrl;
  const button = form.querySelector('.submit');
  button.disabled = true;
  button.textContent = 'Sending…';
  if (isSpam) {
    localStorage.removeItem(STORAGE_KEY);
    form.innerHTML = successHTML;
    document.querySelector('#save-status').textContent = 'Submitted successfully';
    return;
  }
  try {
    if (!endpoint) throw new Error('No submission endpoint configured');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Submission failed (${response.status})`);
    localStorage.removeItem(STORAGE_KEY);
    form.innerHTML = successHTML;
    document.querySelector('#save-status').textContent = 'Submitted successfully';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Submit pledge ↗';
    document.querySelector('#save-status').textContent = error.message;
  }
}

render();
document.title = `Special Character Pledge Form ${pledgeRules.year}`;
document.querySelector('meta[name="description"]')?.setAttribute('content', `Special Character Pledge Form for ${pledgeRules.schoolName}`);
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
  if (event.target.id === 'start-date-input') applyStartDate(event.target.value);
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount') dynamicChildren();
  if (event.target.name === 'schoolChildCount' || event.target.name === 'kindergartenChildCount' || event.target.name === 'custodyApplies') updateCustodySection();
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
