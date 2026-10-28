// This jQuery code is used to hide/show diversity surveys 'dynamically' based on their
// selected country from the dropdown. See more info here:
// https://leverapp.atlassian.net/wiki/spaces/ENG/pages/495911645/How+self-selection+surveys+works+in+postings2
//
// CXE-102: when the multiTargetedSurveys flag is on (a #multi-targeted-surveys-enabled
// marker is rendered), the server emits exactly one most-specific winner per choice value,
// so the catch-all ("all-candidate-locations" / "all-opportunity-locations") survey must
// only appear when no specific-choice survey matched. Flag off preserves the original
// always-show behaviour (the `else` branches below).

function multiTargetedSurveysEnabled() {
  return $('#multi-targeted-surveys-enabled').length > 0;
}

function setSurveyResponseNames($wrappers) {
  $wrappers.children("[data-name*='surveysResponses']").map(function () {
    $(this).attr('name', $(this).attr('data-name'));
  });
}

// Wrapper ids are "countrySurvey" plus one "_<token>" per choice value the winner covers
// (e.g. "countrySurvey_US_CA", "countrySurvey_<locationId>_all-opportunity-locations").
// Match the exact token by splitting on "_" rather than a substring `[id*=...]` selector —
// otherwise a value like "US" would also reveal a wrapper whose id merely contains "US",
// breaking the "exactly one survey per choice" guarantee. Location ids are UUIDs (no "_"),
// so they remain whole tokens.
function wrappersForToken(value) {
  return $("[id*='countrySurvey']").filter(function () {
    return ($(this).attr('id') || '').split('_').indexOf(value) !== -1;
  });
}

$('.candidate-location').change(function() {
  var countryCode = this.value

  if (multiTargetedSurveysEnabled()) {
    $("[id*='countrySurvey']").addClass('hidden');
    $("[id*='countrySurvey'] > [data-name*='surveysResponses']").map(function() {
      $(this).removeAttr('name');
    });

    var $country = countryCode ? wrappersForToken(countryCode) : $();
    $country.removeClass('hidden');
    setSurveyResponseNames($country);

    // No country-specific winner matched -> fall back to the catch-all survey. Gate on a
    // chosen country: an empty/placeholder selection must keep every survey hidden.
    if (countryCode && $country.length === 0) {
      var $catchAll = wrappersForToken('all-candidate-locations');
      $catchAll.removeClass('hidden');
      setSurveyResponseNames($catchAll);
    }
  } else {
    $("[id*='countrySurvey']").addClass('hidden');
    $("[id*='" + countryCode + "']").removeClass('hidden');
    $("[id*='all-candidate-locations']").removeClass('hidden');

    $("[id*='countrySurvey'] > [data-name*='surveysResponses']").map(function() {
      $(this).removeAttr('name');
    });

    $("[id*='" + countryCode + "'] > [data-name*='surveysResponses']").map(function () {
      var name = $(this).attr('data-name');
      $(this).attr('name', name);
    });

    $("[id*='all-candidate-locations'] > [data-name*='surveysResponses']").map(function () {
      var name = $(this).attr('data-name');
      $(this).attr('name', name);
    });
  }

  $("[data-name*='candidateSelectedLocation']").map(function () {
    $(this).attr('value', countryCode);
  });
});

$('.opportunity-location').change(function() {
  var opportunityLocationId = this.value

  if (multiTargetedSurveysEnabled()) {
    $("[id*='countrySurvey']").addClass('hidden');
    $("[id*='countrySurvey'] > [data-name*='surveysResponses']").map(function() {
      $(this).removeAttr('name');
    });

    var $opportunity = opportunityLocationId ? wrappersForToken(opportunityLocationId) : $();
    $opportunity.removeClass('hidden');
    setSurveyResponseNames($opportunity);

    // No location-specific winner matched -> fall back to the catch-all survey. Gate on a
    // chosen location: an empty/placeholder selection must keep every survey hidden.
    if (opportunityLocationId && $opportunity.length === 0) {
      var $catchAll = wrappersForToken('all-opportunity-locations');
      $catchAll.removeClass('hidden');
      setSurveyResponseNames($catchAll);
    }
  } else {
    $("[id*='countrySurvey']").addClass('hidden');
    $("[id*='" + opportunityLocationId + "']").removeClass('hidden');
    $("[id*='all-opportunity-locations']").removeClass('hidden');

    $("[id*='countrySurvey'] > [data-name*='surveysResponses']").map(function() {
      $(this).removeAttr('name');
    });

    $("[id*='" + opportunityLocationId + "'] > [data-name*='surveysResponses']").map(function () {
      var name = $(this).attr('data-name');
      $(this).attr('name', name);
    });

    $("[id*='all-opportunity-locations'] > [data-name*='surveysResponses']").map(function () {
      var name = $(this).attr('data-name');
      $(this).attr('name', name);
    });
  }

  $("[data-name*='opportunitySelectedLocation']").map(function () {
    $(this).attr('value', opportunityLocationId);
  });

  $("[id*='eeoSurvey']").addClass('hidden');
  $("[id*='" + opportunityLocationId + "']").removeClass('hidden');
});
