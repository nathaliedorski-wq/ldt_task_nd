/* =========================================================================
   Consent and Screening — survey_logic.js (ULTRA-STABLE VERSION)
   ========================================================================= */

const PROLIFIC_RETURNED_URL = "https://app.prolific.com/submissions/complete?cc=CKR4DF0X"; 
const PROLIFIC_SCREENOUT_URL = "https://app.prolific.com/submissions/complete?cc=CSI6MIOO"; 


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
            stimulus: `
                <div style="text-align: center;">
                    <img src="stimuli/nebrija_logo.jpg" style="width: 500px; margin-bottom: 25px;" alt="Universidad Nebrija">
                    <h2>Welcome to our experiment and thank you for taking an interest in our study.</h2>
                    <p>Before we start the experiment, we need to confirm some information that you gave on Prolific. Please click below to start.</p>
                </div>`,
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
    const MIN_AGE = 18;
    const MAX_AGE = 65;
    let ageConfirmed = false;

    const ageBlock = {
        timeline: [
            // (a) Age entry
            {
                type: jsPsychSurveyText,
                questions: [{
                    prompt: "Please tell us your age:",
                    name: 'Q1',
                    required: true,
                    input_type: 'number',
                    placeholder: 'e.g. 25'
                }],
                on_finish: function(data) {
                    const age = parseInt(data.response.Q1);
                    participantAnswers.age = isNaN(age) ? 0 : age;
                    ageConfirmed = false;
                }
            },
            // (b) Confirmation — wrapped node, only runs if age IS in bounds
            {
                timeline: [{
                    type: jsPsychHtmlButtonResponse,
                    stimulus: function() {
                        return `<p>You entered: <strong>${participantAnswers.age}</strong>. Is this correct?</p>`;
                    },
                    choices: ['Yes, continue', 'No, correct it'],
                    on_finish: function(data) {
                        ageConfirmed = (data.response === 0);
                    }
                }],
                conditional_function: function() {
                    return participantAnswers.age >= MIN_AGE && participantAnswers.age <= MAX_AGE;
                }
            },
            // (c) Out-of-bounds error — wrapped node, only runs if age is invalid
            {
                timeline: [{
                    type: jsPsychHtmlButtonResponse,
                    stimulus: function() {
                        return `
                            <div style="max-width: 600px; margin: 0 auto; text-align: center;
                                        background: #fde8e8; color: #b91c1c; border: 2px solid #d9534f;
                                        padding: 24px; border-radius: 10px; animation: ageShake 0.4s;">
                                <h3 style="margin-top: 0;">Invalid age</h3>
                                <p>Please enter an age between <strong>${MIN_AGE}</strong> and <strong>${MAX_AGE}</strong>.</p>
                            </div>
                            <style>
                                @keyframes ageShake {
                                    0%, 100% { transform: translateX(0); }
                                    20%, 60% { transform: translateX(-8px); }
                                    40%, 80% { transform: translateX(8px); }
                                }
                            </style>`;
                    },
                    choices: ['Re-enter my age']
                }],
                conditional_function: function() {
                    return participantAnswers.age < MIN_AGE || participantAnswers.age > MAX_AGE;
                }
            }
        ],
        loop_function: function() {
            const outOfBounds = participantAnswers.age < MIN_AGE || participantAnswers.age > MAX_AGE;
            return outOfBounds || !ageConfirmed;
        }
    };

    timeline.push(ageBlock);
    // 3. Laterality 
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [{ prompt: "Is your dominant hand the left one or the right one?:", options: ["Left", "Right"], name: 'Q2', required: true}
        ],
        on_finish: function(data) {
            participantAnswers.laterality = data.response.Q2;
        }
    });
   

    // 4. Screening
    timeline.push({
        type: jsPsychSurveyMultiChoice,
        questions: [
            { prompt: "Are you a native English speaker?", options: ["Yes", "No"], name: 'Q3', required: true },
            { prompt: "Have you ever been diagnosed with a language disorder?", options: ["Yes", "No"], name: 'Q4', required: true }
        ],
        on_finish: function(data) {
            participantAnswers.native_english = data.response.Q3;
            participantAnswers.disorder = data.response.Q4;
        }
    });

    // 4. ENDING TRIAL
    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
            let reasons = [];
            
            // Check eligibility using our saved variable
            if (!participantAnswers.consent || participantAnswers.consent.includes("No")) reasons.push("no consent");
            if (participantAnswers.age < 18 || participantAnswers.age > 65) reasons.push("age requirements");
            if (!participantAnswers.native_english || participantAnswers.native_english.includes("No")) reasons.push("language requirements");
            if (participantAnswers.disorder && participantAnswers.disorder.includes("Yes")) reasons.push("language disorder criteria");

            // IF SUCCESS
            if (reasons.length === 0) {
                return `<h2>Success!</h2><p>Your responses are consistent with your Prolific registration details. Press any key to start the experiment.</p>`;
            }

            // IF FAILURE
            return `
                <div style="max-width: 600px; text-align: left; background: white; color: black; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #d9534f;">Ineligible</h2>
                    <p>Your responses are inconsistent with your Prolific details. Please check your account. <strong>${reasons.join(" and ")}</strong>.</p>
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
    document.addEventListener('input', function(e) {
        if (e.target.type === 'number') {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        }
    });

    jsPsych.run(timeline);
}

if (typeof jatos !== "undefined") { jatos.onLoad(runSurvey); } else { runSurvey(); }