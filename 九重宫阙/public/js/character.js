const character = {
  async load() {
    try {
      const data = await api.getCharacter();
      return data;
    } catch (error) {
      console.error('加载角色失败:', error);
      return null;
    }
  },

  async update(name) {
    try {
      const data = await api.updateCharacter(name);
      return data;
    } catch (error) {
      console.error('更新角色失败:', error);
      return null;
    }
  },

  async getEquipments() {
    try {
      const data = await api.getEquipments();
      return data;
    } catch (error) {
      console.error('加载装备失败:', error);
      return [];
    }
  },

  async getGongfa() {
    try {
      const data = await api.getGongfa();
      return data;
    } catch (error) {
      console.error('加载功法失败:', error);
      return [];
    }
  },

  async getPets() {
    try {
      const data = await api.getPets();
      return data;
    } catch (error) {
      console.error('加载灵宠失败:', error);
      return [];
    }
  },

  async getInventory() {
    try {
      const data = await api.getInventory();
      return data;
    } catch (error) {
      console.error('加载背包失败:', error);
      return [];
    }
  },

  calculateCombatPower(char) {
    return char.attack + char.defense + char.hp + char.speed;
  }
};
