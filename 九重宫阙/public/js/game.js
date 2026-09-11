const game = {
  async loadRealms() {
    try {
      const data = await api.getRealms();
      return data;
    } catch (error) {
      console.error('加载境界失败:', error);
      return [];
    }
  },

  async loadMaps() {
    try {
      const data = await api.getMaps();
      return data;
    } catch (error) {
      console.error('加载地图失败:', error);
      return [];
    }
  },

  async loadDungeons() {
    try {
      const data = await api.getDungeons();
      return data;
    } catch (error) {
      console.error('加载副本失败:', error);
      return [];
    }
  },

  async loadItems() {
    try {
      const data = await api.getItems();
      return data;
    } catch (error) {
      console.error('加载物品失败:', error);
      return [];
    }
  },

  async loadGuilds() {
    try {
      const data = await api.getGuilds();
      return data;
    } catch (error) {
      console.error('加载仙盟失败:', error);
      return [];
    }
  },

  async createGuild(name) {
    try {
      const data = await api.createGuild(name);
      return data;
    } catch (error) {
      console.error('创建仙盟失败:', error);
      return null;
    }
  },

  calculateExpForLevel(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  },

  calculateRealmExp(realm) {
    const realmExp = {
      '炼气': 100,
      '筑基': 500,
      '金丹': 2000,
      '元婴': 8000,
      '化神': 30000,
      '炼虚': 100000,
      '合体': 500000,
      '大乘': 2000000,
      '渡劫': 10000000,
      '飞升': 50000000
    };
    return realmExp[realm] || 100;
  }
};
