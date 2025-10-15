import moodleService from './src/services/moodleService.js';
import { logger } from './src/utils/logger.js';

/**
 * Workaround: Thêm câu hỏi vào quiz bằng cách import từ question bank
 * Thay vì tạo câu hỏi mới (bị lỗi với Moodle 4.3+)
 */

async function createQuestionSimple() {
  const courseId = 12902;
  const quizId = 22896; // Quiz ID vừa tạo

  console.log('🔄 Creating question using Moodle core functions...\n');

  try {
    // Cách 1: Tạo câu hỏi bằng core API
    // Sử dụng core_question_update_flag
    
    const result = await moodleService.callWebService('core_question_update_flag', {
      qubaid: quizId,
      questionid: 1,
      qaid: 1,
      slot: 1,
      checksum: 'test',
      newstate: true
    });

    console.log('Result:', result);

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Thử cách khác - lấy question categories
    console.log('\n📚 Trying alternative: Get question categories...');
    
    try {
      const categories = await moodleService.callWebService(
        'core_question_get_random_question_summaries',
        {
          categoryid: 1,
          includesubcategories: true,
          tagids: []
        }
      );
      
      console.log('Categories:', categories);
    } catch (err) {
      console.error('Also failed:', err.message);
      
      // Plan C: Tạo bằng XML import
      console.log('\n💡 GIẢI PHÁP: Sử dụng Moodle XML Import');
      console.log('Tạo file XML với câu hỏi và import vào Moodle');
      console.log('\nXem file: create-question-xml.js');
    }
  }
}

createQuestionSimple();
