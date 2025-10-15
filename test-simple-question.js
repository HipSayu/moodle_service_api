import moodleService from './src/services/moodleService.js';

/**
 * Test đơn giản - Tạo 1 câu hỏi và thêm vào quiz
 */

async function simpleTest() {
  const quizId = 22897; // Thay bằng quiz ID của bạn

  console.log('🔄 Testing Question Creation and Add to Quiz...\n');

  try {
    // Tạo câu hỏi trắc nghiệm
    const result = await moodleService.createAndAddQuestionToQuiz(quizId, {
      questiontype: 'multichoice',
      name: 'Test Question - ' + new Date().toLocaleString('vi-VN'),
      questiontext: '<p>Đây là câu hỏi test được tạo lúc ' + new Date().toLocaleString('vi-VN') + '</p>',
      defaultmark: 1.0,
      answers: [
        { text: 'Đáp án A (Đúng)', correct: true, feedback: 'Chính xác!' },
        { text: 'Đáp án B', correct: false, feedback: 'Sai rồi' },
        { text: 'Đáp án C', correct: false, feedback: 'Không đúng' },
        { text: 'Đáp án D', correct: false, feedback: 'Sai' }
      ],
      page: 1
    },' f797545faa469cde6f999b2f2e191cc1');

    console.log('✅ SUCCESS!');
    console.log('\nQuestion Info:');
    console.log('  - Question ID:', result.questionid);
    console.log('  - Quiz ID:', result.quizid);
    console.log('  - Question Name:', result.name);
    console.log('  - Question Type:', result.questiontype);
    console.log('  - Message:', result.message);

  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', error.message);
    
    if (error.response?.data) {
      console.error('\nMoodle Error Details:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

simpleTest();
