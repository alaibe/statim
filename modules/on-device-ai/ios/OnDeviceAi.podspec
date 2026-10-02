Pod::Spec.new do |s|
  s.name           = 'OnDeviceAi'
  s.version        = '1.0.0'
  s.summary        = 'The model and the translator built into the device'
  s.author         = ''
  s.homepage       = 'https://github.com/alaibe/statim'
  s.platforms      = { :ios => '18.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'FoundationModels'
  s.frameworks = 'Translation', 'NaturalLanguage'
  s.source_files = '**/*.swift'
end
