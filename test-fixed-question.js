import moodleService from './src/services/moodleService.js';

/**
 * Test tạo câu hỏi và add vào quiz với plugin đã fix
 */

async function testFixed() {
  const quizId = 22897;

  console.log('🔄 Testing FIXED Question API...\n');
  console.log(`Quiz ID: ${quizId}\n`);

  try {
    const result = await moodleService.createAndAddQuestionToQuiz(quizId, {
      questiontype: 'multichoice',
      name: 'Test FIXED - ' + new Date().toLocaleString('vi-VN'),
      questiontext: '<p>Câu hỏi test sau khi fix add_question_to_quiz</p>',
      defaultmark: 1.0,
      answers: [
        { text: 'Đáp án đúng', correct: true, feedback: 'Chính xác!' },
        { text: 'Đáp án sai 1', correct: false, feedback: 'Sai' },
        { text: 'Đáp án sai 2', correct: false, feedback: 'Sai' },
        { text: 'Đáp án sai 3', correct: false, feedback: 'Sai' }
      ],
      page: 1
    });

    console.log('✅ SUCCESS!');
    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n📝 Next: Go to Moodle and check:');
    console.log('   1. Open Quiz 22897');
    console.log('   2. Click "Edit quiz"');
    console.log('   3. The question should NOW appear in the quiz!');

  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', error.message);
    
    if (error.response?.data) {
      console.error('\nMoodle Error:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFixed();
