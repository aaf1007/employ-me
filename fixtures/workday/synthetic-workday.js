/*
 * SYNTHETIC. Not Workday's code. A hand-written stand-in for the behaviour of
 * Workday's apply-flow widgets, so e2e can drive the synthetic Application
 * Forms in this folder (synthetic-*.html) the way it would drive the real
 * ones. Modelled on Workday's public bundles (candidate-experience-jobs and
 * candidate-experience-apply-flow, 2026.43.25) and research §4:
 *
 *   - "Select One" dropdowns: a button[aria-haspopup=listbox] that, while
 *     open, points aria-controls at a popup listbox of [role=option]s.
 *   - Prompts: a searchBox input in a multiselectInputContainer. The popup
 *     (activeListContainer) lists the options; catalogs (schools, skills)
 *     list "No items." until you search. Searching starts on Enter, or as
 *     you type where the employer turned on isSearchTypeAheadEnabled (the
 *     bundle's school prompt has that switch: data-fixture-typeahead here).
 *     Choices show as selectedItem pills.
 *   - Dates: one spinbutton per part (dateSectionMonth-input, ...).
 *   - Panel sets: "Add" / "Add Another" (add-button) append an entry,
 *     numbered by a global counter.
 *   - The page footer moves between steps; "Submit" on Review shows the
 *     "Congratulations!" panel.
 *
 * Everything a test needs to check is counted on window.employMeFixture.
 */
(function () {
  'use strict';

  var fixture = {
    footerClicks: 0,
    submitted: false,
    accountFormSubmits: 0,
    step: 0,
  };
  window.employMeFixture = fixture;

  var popupCounter = 0;
  var entryCounter = Number(document.body.getAttribute('data-fixture-counter') || '20');
  var openPopup = null;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  function optionsOf(el) {
    return JSON.parse(el.getAttribute('data-fixture-options') || '[]');
  }
  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  // ---- Popups ---------------------------------------------------------

  function closePopup() {
    if (openPopup === null) return;
    var owner = openPopup.owner;
    openPopup.element.remove();
    owner.setAttribute('aria-expanded', 'false');
    owner.removeAttribute('aria-controls');
    openPopup = null;
  }

  function renderOptions(listbox, labels, onPick, message) {
    listbox.innerHTML = '';
    if (labels.length === 0) {
      var empty = document.createElement('div');
      empty.setAttribute('data-automation-id', 'multiSelectMessageContainer');
      empty.textContent = message;
      listbox.appendChild(empty);
      return;
    }
    labels.forEach(function (label, i) {
      var option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.setAttribute('id', listbox.id + '-' + i);
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('data-automation-id', 'promptOption');
      option.setAttribute('data-automation-label', label);
      option.textContent = label;
      option.addEventListener('click', function (event) {
        event.stopPropagation();
        onPick(label);
      });
      listbox.appendChild(option);
    });
  }

  function openList(owner, labels, onPick, options) {
    closePopup();
    var container = document.createElement('div');
    container.setAttribute('data-automation-id', 'activeListContainer');
    var listbox = document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    listbox.id = 'popup-listbox-' + ++popupCounter;
    container.appendChild(listbox);
    document.body.appendChild(container);
    renderOptions(listbox, labels, onPick, options.message);
    owner.setAttribute('aria-expanded', 'true');
    if (options.controls) owner.setAttribute('aria-controls', listbox.id);
    openPopup = { owner: owner, element: container, listbox: listbox, onPick: onPick };
    return openPopup;
  }

  document.addEventListener('click', function (event) {
    if (openPopup === null) return;
    var target = event.target;
    if (openPopup.element.contains(target) || openPopup.owner === target) return;
    closePopup();
  });

  // ---- "Select One" dropdowns -----------------------------------------

  function chooseInDropdown(button, label) {
    button.textContent = label;
    button.setAttribute('value', 'id-' + label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase());
    var mirror = button.nextElementSibling;
    if (mirror !== null && mirror.localName === 'input') mirror.value = button.getAttribute('value');
    closePopup();
    button.dispatchEvent(new CustomEvent('fixture-change', { bubbles: true, detail: label }));
  }

  function openDropdown(button) {
    if (openPopup !== null && openPopup.owner === button) return;
    openList(
      button,
      optionsOf(button),
      function (label) {
        chooseInDropdown(button, label);
      },
      { controls: true, message: 'No items.' },
    );
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('button[aria-haspopup="listbox"]');
    if (!button) return;
    if (openPopup !== null && openPopup.owner === button) closePopup();
    else openDropdown(button);
  });

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!target.matches) return;
    if (target.matches('button[aria-haspopup="listbox"]')) {
      if (event.key === 'Escape') closePopup();
      else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') openDropdown(target);
    }
    if (target.matches('input[data-automation-id="searchBox"]')) promptKey(target, event);
  });

  // ---- Prompts --------------------------------------------------------

  function promptContainer(input) {
    return input.closest('[data-automation-id="multiselectInputContainer"]');
  }

  function addPill(input, label) {
    var list = $('[data-automation-id="selectedItemList"]', promptContainer(input));
    var multi = input.getAttribute('data-fixture-multi') === 'true';
    if (!multi) list.innerHTML = '';
    if ($all('[data-automation-id="selectedItem"]', list).some(function (p) { return p.textContent === label; })) {
      return;
    }
    var item = document.createElement('li');
    var pill = document.createElement('div');
    pill.setAttribute('data-automation-id', 'selectedItem');
    pill.setAttribute('aria-label', label);
    pill.textContent = label;
    var charm = document.createElement('div');
    charm.setAttribute('data-automation-id', 'DELETE_charm');
    charm.setAttribute('role', 'button');
    charm.setAttribute('aria-label', 'press delete to clear value');
    charm.addEventListener('click', function () {
      item.remove();
    });
    item.appendChild(pill);
    item.appendChild(charm);
    list.appendChild(item);
  }

  function pickInPrompt(input, label) {
    addPill(input, label);
    input.value = '';
    if (input.getAttribute('data-fixture-multi') !== 'true') closePopup();
    input.dispatchEvent(new CustomEvent('fixture-change', { bubbles: true, detail: label }));
  }

  function openPrompt(input) {
    if (openPopup !== null && openPopup.owner === input) return openPopup;
    var catalog = input.getAttribute('data-fixture-catalog') === 'true';
    return openList(
      input,
      catalog ? [] : optionsOf(input),
      function (label) {
        pickInPrompt(input, label);
      },
      { controls: false, message: 'No items.' },
    );
  }

  function promptKey(input, event) {
    if (event.key === 'Escape') {
      closePopup();
      return;
    }
    if (event.key === 'Enter' || event.keyCode === 13) search(input);
  }

  var typing = null;
  document.addEventListener('input', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('input[data-automation-id="searchBox"][data-fixture-typeahead="true"]')) return;
    clearTimeout(typing);
    typing = setTimeout(function () {
      search(input);
    }, 200);
  });

  // The list empties, loads, then shows the matches.
  function search(input) {
    var popup = openPrompt(input);
    var text = input.value.trim().toLowerCase();
    popup.listbox.innerHTML = '';
    popup.listbox.setAttribute('aria-busy', 'true');
    setTimeout(function () {
      if (openPopup !== popup) return;
      popup.listbox.removeAttribute('aria-busy');
      var hits = optionsOf(input).filter(function (label) {
        return text === '' || label.toLowerCase().indexOf(text) !== -1;
      });
      renderOptions(popup.listbox, hits, popup.onPick, 'No matches found');
    }, 250);
  }

  document.addEventListener('click', function (event) {
    var input = event.target.closest && event.target.closest('input[data-automation-id="searchBox"]');
    if (input) openPrompt(input);
  });

  // ---- Date spinbuttons -----------------------------------------------

  document.addEventListener('input', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('input[role="spinbutton"]')) return;
    var digits = input.value.replace(/\D/g, '').slice(0, Number(input.getAttribute('data-fixture-length') || '4'));
    input.value = digits;
    input.setAttribute('aria-valuenow', digits === '' ? '' : String(Number(digits)));
    input.setAttribute('aria-valuetext', digits);
    var display = document.getElementById(input.id.replace(/-input$/, '-display'));
    if (display !== null) display.textContent = digits || display.getAttribute('data-placeholder');
  });

  // ---- Dependent fields -----------------------------------------------

  var REGIONS = {
    Canada: { label: 'Province or Territory', options: ['Alberta', 'British Columbia', 'Ontario', 'Quebec'] },
    'United States of America': { label: 'State', options: ['California', 'New York', 'Texas', 'Washington'] },
  };

  document.addEventListener('fixture-change', function (event) {
    var source = event.target;
    var region = source.getAttribute('data-fixture-region');
    if (region === null) return;
    var target = document.getElementById(region);
    var spec = REGIONS[event.detail];
    if (target === null || spec === undefined) return;
    target.setAttribute('data-fixture-options', JSON.stringify(spec.options));
    target.textContent = 'Select One';
    var label = document.querySelector('label[for="' + region + '"]');
    if (label !== null) label.firstChild.textContent = spec.label;
  });

  document.addEventListener('change', function (event) {
    var box = event.target;
    if (!box.matches || !box.matches('input[type="checkbox"]')) return;
    var toggles = box.getAttribute('data-fixture-toggles');
    if (toggles === null) return;
    var scope = box.closest('[data-fixture-scope]') || document;
    if (box.getAttribute('data-fixture-toggle-mode') === 'remove') {
      // "I currently work here" removes "To".
      var gone = $(toggles, scope);
      if (box.checked && gone !== null) {
        gone.setAttribute('data-fixture-removed', 'true');
        box.fixtureRemoved = gone;
        gone.remove();
      } else if (!box.checked && box.fixtureRemoved) {
        box.closest('[data-fixture-scope]').insertBefore(box.fixtureRemoved, box.closest('[data-automation-id^="formField-"]').nextSibling);
      }
      return;
    }
    // "I have a preferred name" adds the preferred-name fields.
    var slot = $(toggles, scope);
    var template = document.getElementById(slot.getAttribute('data-fixture-template'));
    slot.innerHTML = box.checked ? template.innerHTML : '';
  });

  // ---- Panel sets -----------------------------------------------------

  document.addEventListener('click', function (event) {
    var add = event.target.closest && event.target.closest('[data-automation-id="add-button"]');
    if (!add) return;
    var group = add.closest('[role="group"]');
    var entries = $('[data-fixture-entries]', group);
    var template = document.getElementById(entries.getAttribute('data-fixture-template'));
    var number = ++entryCounter;
    var index = entries.children.length + 1;
    var html = template.innerHTML.replace(/\{n\}/g, String(number)).replace(/\{i\}/g, String(index));
    var holder = document.createElement('div');
    holder.innerHTML = html;
    while (holder.firstChild) entries.appendChild(holder.firstChild);
    add.textContent = 'Add Another';
    add.setAttribute('aria-label', 'Add Another ' + add.getAttribute('data-fixture-section'));
  });

  // ---- Uploads --------------------------------------------------------

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('input[data-automation-id="file-upload-input-ref"]')) return;
    var files = Array.prototype.slice.call(input.files || []);
    var list = $('[data-fixture-uploads]', input.closest('[role="group"]'));
    files.forEach(function (file) {
      var item = document.createElement('div');
      item.setAttribute('data-automation-id', 'file-upload-item');
      item.innerHTML =
        '<div data-automation-id="file-upload-item-name"></div><div data-automation-id="file-upload-successful">Successfully Uploaded!</div>';
      item.firstChild.textContent = file.name;
      list.appendChild(item);
    });
    // As Workday does: the files move into its own state and the input is cleared.
    input.value = '';
  });

  // ---- Steps ----------------------------------------------------------

  function steps() {
    return $all('[data-fixture-step]');
  }

  function showStep(index) {
    steps().forEach(function (page, i) {
      if (i === index) page.removeAttribute('hidden');
      else page.setAttribute('hidden', '');
    });
    $all('[data-automation-id="progressBar"] li').forEach(function (li, i) {
      li.setAttribute(
        'data-automation-id',
        i === index ? 'progressBarActiveStep' : i < index ? 'progressBarCompletedStep' : 'progressBarInactiveStep',
      );
    });
    var next = $('[data-automation-id="pageFooterNextButton"]');
    if (next !== null) next.textContent = index === steps().length - 1 ? 'Submit' : 'Save and Continue';
    fixture.step = index;
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-automation-id="pageFooterNextButton"], [data-automation-id="pageFooterBackButton"]');
    if (!button) return;
    fixture.footerClicks += 1;
    if (button.getAttribute('data-automation-id') === 'pageFooterBackButton') {
      showStep(Math.max(0, fixture.step - 1));
      return;
    }
    if (fixture.step < steps().length - 1) {
      showStep(fixture.step + 1);
      return;
    }
    fixture.submitted = true;
    $('[data-automation-id="applyFlowPage"]').setAttribute('hidden', '');
    var done = document.getElementById('fixture-congratulations');
    document.body.appendChild(done.content.cloneNode(true));
    history.replaceState(null, '', location.pathname.replace(/\/apply\/.*$/, '') + '?Job_Application_ID=synthetic');
  });

  // ---- Sign-in --------------------------------------------------------

  document.addEventListener('submit', function (event) {
    // A test that reaches this has failed: employ-me must never create an account or sign in.
    event.preventDefault();
    fixture.accountFormSubmits += 1;
  });

  var signIn = $('[data-automation-id="signInContent"]');
  var createAccount = signIn === null ? '' : signIn.innerHTML;
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('[data-automation-id="signInLink"], [data-automation-id="createAccountLink"]');
    if (!link) return;
    signIn.innerHTML =
      link.getAttribute('data-automation-id') === 'signInLink'
        ? document.getElementById('fixture-sign-in').innerHTML
        : createAccount;
  });

  if (steps().length > 0) showStep(0);
})();
