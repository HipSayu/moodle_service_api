// Test script for syncing categories to Moodle
import axios from 'axios';

async function syncCategories() {
  try {
    // API will automatically get department data from databaseService.getCategory()
    const response = await axios.post('http://localhost:3000/api/sync/category');

    console.log('Sync completed:', response.data);
  } catch (error) {
    console.error('Sync failed:', error.response?.data || error.message);
  }
}

// Uncomment to run the sync
// syncCategories();

export { syncCategories };