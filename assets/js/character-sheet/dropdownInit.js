/**
 * Dropdown population for the character sheet.
 * Populates wizard school, library sanctum, and year dropdowns
 * before state is loaded.
 */

export function populateDropdowns(dataModule) {
    // Populate wizard school dropdown
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    if (wizardSchoolSelect && dataModule.schoolBenefits) {
        wizardSchoolSelect.innerHTML = '<option value="">-- Select a School --</option>';
        Object.keys(dataModule.schoolBenefits).forEach(schoolName => {
            const opt = document.createElement('option');
            opt.value = schoolName;
            opt.textContent = schoolName;
            wizardSchoolSelect.appendChild(opt);
        });
    }

    // Populate library sanctum dropdown
    const librarySanctumSelect = document.getElementById('librarySanctum');
    if (librarySanctumSelect && dataModule.sanctumBenefits) {
        librarySanctumSelect.innerHTML = '<option value="">-- Select a Sanctum --</option>';
        Object.keys(dataModule.sanctumBenefits).forEach(sanctumName => {
            const sanctum = dataModule.sanctumBenefits[sanctumName];
            const opt = document.createElement('option');
            opt.value = sanctum?.id || sanctumName;
            opt.textContent = sanctum?.name || sanctumName;
            librarySanctumSelect.appendChild(opt);

            // Backward compatibility: support legacy saved/form values that used display name as value.
            if (sanctum?.id && sanctumName !== sanctum.id) {
                const legacyOpt = document.createElement('option');
                legacyOpt.value = sanctumName;
                legacyOpt.textContent = sanctum?.name || sanctumName;
                legacyOpt.hidden = true;
                librarySanctumSelect.appendChild(legacyOpt);
            }
        });
    }

    // Populate year dropdowns (for quest month/year selection)
    const populateYearDropdown = (selectElement) => {
        if (!selectElement) return;

        // Keep the first option (-- Select Year --) if it exists, otherwise clear
        const firstOption = selectElement.querySelector('option[value=""]');
        selectElement.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">-- Select Year --</option>';

        // Populate years: start from 2025 (game launch year) to current year + 2 years
        const currentYear = new Date().getFullYear();
        const startYear = 2025; // Game launch year
        const endYear = Math.max(currentYear + 2, startYear); // At least show current year + 2

        for (let year = startYear; year <= endYear; year++) {
            const opt = document.createElement('option');
            opt.value = String(year);
            opt.textContent = String(year);
            selectElement.appendChild(opt);
        }
    };

    populateYearDropdown(document.getElementById('quest-year'));
    populateYearDropdown(document.getElementById('edit-quest-year'));
}
