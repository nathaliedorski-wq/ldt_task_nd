/* =========================================================================
   Consent and Screening — survey_logic.js (FIXED VERSION)
   ========================================================================= */

const PROLIFIC_RETURNED_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_ME_CODE1"; 
const PROLIFIC_SCREENOUT_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_ME_CODE2"; 

const jsPsych = initJsPsych({
    display_element: 'jspsych-target',
    on_finish: function() {
        if (typeof jatos !== "undefined") {
            // 1. Get the consent result
            const consentData = jsPsych.data.get().filter({tag: 'consent'}).values()[0];
            const consentResponse = consentData ? consentData.response.consent : "No";

            // 2. Get the screening result (English/Disorder)
            const screeningData = jsPsych.data.get().filter({tag: 'screening'}).values()[0];
            const responses = screeningData ? screeningData.response : {};
            
            const isNative = responses.native_english === "Yes";
            const hasDisorder = responses.disorder === "Yes";

            const finalCSV = jsPsych.data.get().csv();

            // ROUTING LOGIC
            if (consentResponse !== "Yes") {
                jatos.submitResultData(finalCSV, () => { window.location.href = PROLIFIC_RETURNED_URL; });
            } else if (!isNative || hasDisorder) {
                jatos.submitResultData(finalCSV, () => { window.location.href = PROLIFIC_SCREENOUT_URL; });
            } else {
                // SUCCESS -> NEXT COMPONENT
                jatos.submitResultData(finalCSV, jatos.startNextComponent);
            }
        }
    }
});

function runSurvey() {
    const timeline = [];

    // Screen 1: Consent
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [{
            prompt: "This is an experiment on Language Processing. Participation is voluntary and your data is anonymously stored. <br><strong>Do you consent?</strong>",
            options: ["Yes", "No"],
            name: 'consent',
            required: true
        }],
        data: { tag: 'consent' } // <--- This tag allows us to find the answer later
    });

    // Screen 2: Age
    timeline.push({
        type: jsPsychSurveyText,
        questions: [{ prompt: "Please enter your age :", name: 'age', required: true }],
        data: { tag: 'age' }
    });

    // Screen 3: Demographics & Gating
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [
            { prompt: "What is your gender?", options: ["Male", "Female", "Other"], name: 'gender', required: true },
            { prompt: "What is your highest education level?", options: ["High school", "Bachelor's", "Master's", "More"], name: 'education', required: true },
            { prompt: "Are you a native English speaker?", options: ["Yes", "No"], name: 'native_english', required: true },
            { prompt: "Have you ever been diagnosed with a language disorder?", options: ["Yes", "No"], name: 'disorder', required: true }
        ],
        data: { tag: 'screening' } // <--- This tag matches the filter in the code above
    });

    jsPsych.run(timeline);
}

if (typeof jatos !== "undefined") {
    jatos.onLoad(runSurvey);
} else {
    runSurvey();
}