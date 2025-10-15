<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

defined('MOODLE_INTERNAL') || die();

// Required Moodle libraries
global $CFG;
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/quiz/lib.php');
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->libdir . '/externallib.php');

/**
 * External Web Service for Quiz API
 *
 * @package    local_quizapi
 * @copyright  2025 HUCE
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class local_quizapi_external extends external_api {

    /**
     * Returns description of method parameters for create_quiz
     * @return external_function_parameters
     */
    public static function create_quiz_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'name' => new external_value(PARAM_TEXT, 'Quiz name'),
            'intro' => new external_value(PARAM_RAW, 'Quiz introduction', VALUE_DEFAULT, ''),
            'section' => new external_value(PARAM_INT, 'Section number', VALUE_DEFAULT, 0),
            'timeopen' => new external_value(PARAM_INT, 'Time open', VALUE_DEFAULT, 0),
            'timeclose' => new external_value(PARAM_INT, 'Time close', VALUE_DEFAULT, 0),
            'timelimit' => new external_value(PARAM_INT, 'Time limit in seconds', VALUE_DEFAULT, 0),
            'attempts' => new external_value(PARAM_INT, 'Number of attempts allowed', VALUE_DEFAULT, 0),
            'grademethod' => new external_value(PARAM_INT, 'Grading method', VALUE_DEFAULT, 1),
            'grade' => new external_value(PARAM_FLOAT, 'Maximum grade', VALUE_DEFAULT, 10),
            'password' => new external_value(PARAM_TEXT, 'Quiz password', VALUE_DEFAULT, ''),
            'shuffleanswers' => new external_value(PARAM_INT, 'Shuffle answers', VALUE_DEFAULT, 1),
            'visible' => new external_value(PARAM_INT, 'Visible', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * Create a quiz in a course - Direct DB approach for Moodle 4.3
     */
    public static function create_quiz($courseid, $name, $intro = '', $section = 0, 
                                      $timeopen = 0, $timeclose = 0, $timelimit = 0,
                                      $attempts = 0, $grademethod = 1, $grade = 10,
                                      $password = '', $shuffleanswers = 1, $visible = 1) {
        global $CFG, $DB;

        // Parameter validation
        $params = self::validate_parameters(self::create_quiz_parameters(), [
            'courseid' => $courseid,
            'name' => $name,
            'intro' => $intro,
            'section' => $section,
            'timeopen' => $timeopen,
            'timeclose' => $timeclose,
            'timelimit' => $timelimit,
            'attempts' => $attempts,
            'grademethod' => $grademethod,
            'grade' => $grade,
            'password' => $password,
            'shuffleanswers' => $shuffleanswers,
            'visible' => $visible,
        ]);

        // Verify course exists
        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        
        // Check capability
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('local/quizapi:createquiz', $context);

        // Get quiz module id
        $module = $DB->get_record('modules', ['name' => 'quiz'], '*', MUST_EXIST);
        
        // Start transaction
        $transaction = $DB->start_delegated_transaction();
        
        try {
            // Create quiz instance in database
            $quiz = new stdClass();
            $quiz->course = $course->id;
            $quiz->name = $params['name'];
            $quiz->intro = $params['intro'];
            $quiz->introformat = FORMAT_HTML;
            $quiz->timeopen = $params['timeopen'];
            $quiz->timeclose = $params['timeclose'];
            $quiz->timelimit = $params['timelimit'];
            $quiz->overduehandling = 'autosubmit';
            $quiz->graceperiod = 0;
            $quiz->quizpassword = $params['password'];
            $quiz->subnet = '';
            $quiz->browsersecurity = '-';
            $quiz->delay1 = 0;
            $quiz->delay2 = 0;
            $quiz->attempts = $params['attempts'];
            $quiz->grademethod = $params['grademethod'];
            $quiz->grade = $params['grade'];
            $quiz->sumgrades = 0;
            $quiz->questionsperpage = 1;
            $quiz->navmethod = 'free';
            $quiz->shuffleanswers = $params['shuffleanswers'];
            $quiz->preferredbehaviour = 'deferredfeedback';
            $quiz->canredoquestions = 0;
            $quiz->attemptonlast = 0;
            $quiz->reviewattempt = 69904;
            $quiz->reviewcorrectness = 69904;
            $quiz->reviewmarks = 69904;
            $quiz->reviewspecificfeedback = 69904;
            $quiz->reviewgeneralfeedback = 69904;
            $quiz->reviewrightanswer = 69904;
            $quiz->reviewoverallfeedback = 69904;
            $quiz->showuserpicture = 0;
            $quiz->showblocks = 0;
            $quiz->completionpass = 0;
            $quiz->completionattemptsexhausted = 0;
            $quiz->completionminattempts = 0;
            $quiz->timecreated = time();
            $quiz->timemodified = time();
            
            $quiz->id = $DB->insert_record('quiz', $quiz);
            
            // Create course module
            $cm = new stdClass();
            $cm->course = $course->id;
            $cm->module = $module->id;
            $cm->instance = $quiz->id;
            $cm->section = $params['section'];
            $cm->idnumber = '';
            $cm->added = time();
            $cm->score = 0;
            $cm->indent = 0;
            $cm->visible = $params['visible'];
            $cm->visibleoncoursepage = $params['visible'];
            $cm->visibleold = $params['visible'];
            $cm->groupmode = 0;
            $cm->groupingid = 0;
            $cm->completion = 0;
            $cm->completionexpected = 0;
            $cm->showdescription = 0;
            $cm->availability = null;
            $cm->deletioninprogress = 0;
            $cm->downloadcontent = null;
            $cm->lang = '';
            
            // Use add_course_module instead of direct insert
            $cm->id = add_course_module($cm);
            
            // Add module to section
            course_add_cm_to_section($course, $cm->id, $params['section']);
            
            // Rebuild course cache
            rebuild_course_cache($course->id, true);
            
            // Commit transaction
            $transaction->allow_commit();
            
            return [
                'quizid' => $quiz->id,
                'courseid' => $course->id,
                'name' => $params['name'],
                'message' => 'Quiz created successfully'
            ];
            
        } catch (Exception $e) {
            $transaction->rollback($e);
            throw $e;
        }
    }

    /**
     * Returns description of method result value for create_quiz
     * @return external_single_structure
     */
    public static function create_quiz_returns() {
        return new external_single_structure([
            'quizid' => new external_value(PARAM_INT, 'Quiz ID'),
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'name' => new external_value(PARAM_TEXT, 'Quiz name'),
            'message' => new external_value(PARAM_TEXT, 'Success message')
        ]);
    }

    /**
     * Returns description of method parameters for get_quiz_info
     * @return external_function_parameters
     */
    public static function get_quiz_info_parameters() {
        return new external_function_parameters([
            'quizid' => new external_value(PARAM_INT, 'Quiz ID')
        ]);
    }

    /**
     * Get quiz information
     * @param int $quizid Quiz ID
     * @return array Quiz information
     */
    public static function get_quiz_info($quizid) {
        global $DB;

        $params = self::validate_parameters(self::get_quiz_info_parameters(), [
            'quizid' => $quizid
        ]);

        $quiz = $DB->get_record('quiz', ['id' => $params['quizid']], '*', MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $quiz->course], '*', MUST_EXIST);
        
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('local/quizapi:managequiz', $context);

        return [
            'quizid' => $quiz->id,
            'courseid' => $quiz->course,
            'name' => $quiz->name,
            'intro' => $quiz->intro,
            'timeopen' => $quiz->timeopen,
            'timeclose' => $quiz->timeclose,
            'timelimit' => $quiz->timelimit,
            'attempts' => $quiz->attempts,
            'grademethod' => $quiz->grademethod,
            'grade' => $quiz->grade
        ];
    }

    /**
     * Returns description of method result value for get_quiz_info
     * @return external_single_structure
     */
    public static function get_quiz_info_returns() {
        return new external_single_structure([
            'quizid' => new external_value(PARAM_INT, 'Quiz ID'),
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'name' => new external_value(PARAM_TEXT, 'Quiz name'),
            'intro' => new external_value(PARAM_RAW, 'Quiz introduction'),
            'timeopen' => new external_value(PARAM_INT, 'Time open'),
            'timeclose' => new external_value(PARAM_INT, 'Time close'),
            'timelimit' => new external_value(PARAM_INT, 'Time limit'),
            'attempts' => new external_value(PARAM_INT, 'Number of attempts'),
            'grademethod' => new external_value(PARAM_INT, 'Grading method'),
            'grade' => new external_value(PARAM_FLOAT, 'Maximum grade')
        ]);
    }

    /**
     * Returns description of method parameters for add_question_to_quiz
     * @return external_function_parameters
     */
    public static function add_question_to_quiz_parameters() {
        return new external_function_parameters([
            'quizid' => new external_value(PARAM_INT, 'Quiz ID'),
            'questionid' => new external_value(PARAM_INT, 'Question ID'),
            'page' => new external_value(PARAM_INT, 'Page number', VALUE_DEFAULT, 1),
            'maxmark' => new external_value(PARAM_FLOAT, 'Maximum mark', VALUE_DEFAULT, 1.0)
        ]);
    }

    /**
     * Add a question to a quiz
     * @param int $quizid Quiz ID
     * @param int $questionid Question ID
     * @param int $page Page number
     * @param float $maxmark Maximum mark
     * @return array Result
     */
    public static function add_question_to_quiz($quizid, $questionid, $page = 1, $maxmark = 1.0) {
        global $CFG, $DB;

        $params = self::validate_parameters(self::add_question_to_quiz_parameters(), [
            'quizid' => $quizid,
            'questionid' => $questionid,
            'page' => $page,
            'maxmark' => $maxmark
        ]);

        $quiz = $DB->get_record('quiz', ['id' => $params['quizid']], '*', MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $quiz->course], '*', MUST_EXIST);
        
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('local/quizapi:managequiz', $context);

        // Add question to quiz using quiz_add_quiz_question
        require_once($CFG->dirroot . '/mod/quiz/locallib.php');
        quiz_add_quiz_question($params['questionid'], $quiz, $params['page'], $params['maxmark']);

        // Update sum grades
        quiz_update_sumgrades($quiz);

        return [
            'success' => true,
            'quizid' => $quiz->id,
            'questionid' => $params['questionid'],
            'message' => 'Question added successfully'
        ];
    }

    /**
     * Returns description of method result value for add_question_to_quiz
     * @return external_single_structure
     */
    public static function add_question_to_quiz_returns() {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'quizid' => new external_value(PARAM_INT, 'Quiz ID'),
            'questionid' => new external_value(PARAM_INT, 'Question ID'),
            'message' => new external_value(PARAM_TEXT, 'Success message')
        ]);
    }
}
