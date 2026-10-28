"use strict";
$(function () {
    var selector = '.required-field :checkbox';
    var groupFor = function (checkbox) {
        return $(selector).filter(function (_index, element) { return element.name === checkbox.name; });
    };
    var syncGroup = function ($group) {
        var needsAnswer = !$group.closest('.hidden').length && !$group.is(':checked');
        $group.prop('required', needsAnswer);
    };
    var syncAll = function () {
        var synced = {};
        $(selector).each(function (_index, element) {
            var checkbox = element;
            if (!synced[checkbox.name]) {
                synced[checkbox.name] = true;
                syncGroup(groupFor(checkbox));
            }
        });
    };
    syncAll();
    $(document).on('change', selector, function (event) {
        syncGroup(groupFor(event.target));
    });
    $(document).on('click', 'form [type="submit"]', syncAll);
});
//# sourceMappingURL=requiredCheckboxGroups.js.map