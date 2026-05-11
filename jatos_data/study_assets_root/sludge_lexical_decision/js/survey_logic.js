/* =========================================================================
   Consent and Screening — survey_logic.js (ULTRA-STABLE VERSION)
   ========================================================================= */

const PROLIFIC_RETURNED_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_ME_CODE1"; 
const PROLIFIC_SCREENOUT_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_ME_CODE2"; 

// OUTSIDE THE BOX: We save answers here immediately to avoid "Technical Errors"
let participantAnswers = {
    consent: "",
    age: 0,
    native_english: "",
    disorder: ""
};

const jsPsych = initJsPsych({
    display_element: 'jspsych-target'
});

function runSurvey() {
    const timeline = [];

    // 0. Welcome
    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: `<h2>Welcome to our experiment and thank you for taking an interest in our study.</h2><p>Before we start the experiment, we need to ask you a couple of questions. Please click below to start.</p>`,
        choices: ['Continue']
    });

    // 1. Consent
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [{ prompt: "Participation is voluntary and your data will be stored anonymously. Do you consent?", options: ["Yes", "No"], name: 'Q0', required: true }],
        on_finish: function(data) {
            participantAnswers.consent = data.response.Q0;
        }
    });

    // 2. Age
    timeline.push({
        type: jsPsychSurveyText,
        questions: [{ prompt: "Please tell us your age:", name: 'Q1', required: true, input_type: 'number' }],
        on_finish: function(data) {
            participantAnswers.age = parseInt(data.response.Q1);
        }
    });

    // 3. Screening
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [
            { prompt: "Are you a native English speaker?", options: ["Yes", "No"], name: 'Q2', required: true },
            { prompt: "Have you ever been diagnosed with a language disorder?", options: ["Yes", "No"], name: 'Q3', required: true }
        ],
        on_finish: function(data) {
            participantAnswers.native_english = data.response.Q2;
            participantAnswers.disorder = data.response.Q3;
        }
    });

    // 4. THE ONLY ENDING TRIAL (No more race conditions)
    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
            let reasons = [];
            
            // Check eligibility using our saved variable
            if (!participantAnswers.consent || participantAnswers.consent.includes("No")) reasons.push("no consent");
            if (participantAnswers.age < 18 || participantAnswers.age > 65) reasons.push("age requirements");
            if (!participantAnswers.native_english || participantAnswers.native_english.includes("No")) reasons.push("language requirements");
            if (participantAnswers.disorder && participantAnswers.disorder.includes("Yes")) reasons.push("health criteria");

            // IF SUCCESS
            if (reasons.length === 0) {
                return `<h2>Success!</h2><p>You are eligible. Press any key to start the experiment.</p>`;
            }

            // IF FAILURE
            return `
                <div style="max-width: 600px; text-align: left; background: white; color: black; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #d9534f;">Ineligible</h2>
                    <p>You are ineligible because of <strong>${reasons.join(" and ")}</strong>.</p>
                    <p>Press any key to be redirected to Prolific.</p>
                </div>`;
        },
        choices: "ALL_KEYS",
        on_finish: function() {
            if (typeof jatos !== "undefined") {
                let reasons = [];
                if (!participantAnswers.consent.includes("Yes")) reasons.push("consent");
                if (participantAnswers.age < 18 || participantAnswers.age > 65) reasons.push("age");
                if (!participantAnswers.native_english.includes("Yes")) reasons.push("english");
                if (participantAnswers.disorder.includes("Yes")) reasons.push("disorder");

                if (reasons.length === 0) {
                    // SUCCESS PATH
                    jatos.submitResultData(jsPsych.data.get().csv(), jatos.startNextComponent);
                } else {
                    // FAILURE PATH: Use Prolific Return URL if no consent, otherwise Screenout URL
                    const targetUrl = participantAnswers.consent.includes("Yes") ? PROLIFIC_SCREENOUT_URL : PROLIFIC_RETURNED_URL;
                    jatos.endStudyAndRedirect(targetUrl);
                }
            }
        }
    });

    jsPsych.run(timeline);
}

if (typeof jatos !== "undefined") { jatos.onLoad(runSurvey); } else { runSurvey(); }